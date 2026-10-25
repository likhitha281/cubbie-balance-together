import streamlit as st

from src.agent import BalanceAgent
from src.coordinator import Coordinator
from src.group_chat import (
    opening_message,
    outcome_to_group_message,
    privacy_response,
    private_confirmation_message,
    round_to_group_message,
)
from src.models import PrivateConstraint, StudentProfile


st.set_page_config(
    page_title="Balance Together",
    page_icon="💬",
    layout="centered",
)


st.title("💬 Balance Together")
st.caption(
    "Make plans together without making everyone's "
    "private schedule everyone else's business."
)


# -------------------------
# Demo student agents
# -------------------------

slots = [
    "Friday 7–9 PM",
    "Saturday 6–8 PM",
    "Sunday 6–8 PM",
]


agents = [
    BalanceAgent(
        StudentProfile(
            student_id="Likhitha",
            preferred_slots=["Friday 7–9 PM"],
            acceptable_slots=["Saturday 6–8 PM"],
            private_constraints=[
                PrivateConstraint(
                    slot="Sunday 6–8 PM",
                    reason="Private academic commitment",
                    opportunity_cost=0.9,
                )
            ],
        )
    ),

    BalanceAgent(
        StudentProfile(
            student_id="Maya",
            preferred_slots=["Saturday 6–8 PM"],
            acceptable_slots=[
                "Friday 7–9 PM",
                "Sunday 6–8 PM",
            ],
            private_constraints=[
                PrivateConstraint(
                    slot="Friday 7–9 PM",
                    reason="Private preparation time",
                    opportunity_cost=0.8,
                )
            ],
        )
    ),

    BalanceAgent(
        StudentProfile(
            student_id="Alex",
            preferred_slots=["Sunday 6–8 PM"],
            acceptable_slots=["Saturday 6–8 PM"],
            private_constraints=[
                PrivateConstraint(
                    slot="Friday 7–9 PM",
                    reason="Private work commitment",
                    hard_conflict=True,
                    opportunity_cost=1.0,
                )
            ],
        )
    ),
]


# -------------------------
# Fake human group messages
# -------------------------

with st.chat_message("user"):
    st.markdown("**Maya**")
    st.write("dinner this weekend?? 🍕")

with st.chat_message("user"):
    st.markdown("**Alex**")
    st.write("I'm in")

with st.chat_message("user"):
    st.markdown("**Likhitha**")
    st.write("@Cubbie find a time that works for everyone")


# -------------------------
# Start coordination
# -------------------------

if st.button(
    "✨ Ask Cubbie to coordinate",
    use_container_width=True,
):

    opening = opening_message()

    with st.chat_message("assistant"):
        st.markdown("**Cubbie**")
        st.write(opening.text)

    coordinator = Coordinator(
        agents=agents,
        candidate_slots=slots,
    )

    outcome = coordinator.negotiate(
        initial_slot="Friday 7–9 PM"
    )

    for round_record in outcome.rounds:

        safe_message = round_to_group_message(
            round_record.proposed_slot,
            round_record.responses,
        )

        with st.chat_message("assistant"):
            st.markdown("**Cubbie**")
            st.write(safe_message.text)

    final_message = outcome_to_group_message(
        outcome
    )

    with st.chat_message("assistant"):
        st.markdown("**Cubbie**")
        st.write(final_message.text)

    st.session_state["outcome"] = outcome


# -------------------------
# Confirmation stage
# -------------------------

outcome = st.session_state.get("outcome")

if outcome and outcome.agreed_slot:

    if st.button(
        "Ask everyone privately",
        use_container_width=True,
    ):

        st.session_state["confirming"] = True


if st.session_state.get("confirming"):

    st.divider()

    st.subheader("Private confirmations")

    st.caption(
        "These messages are private. "
        "The group does not see anyone's reason."
    )

    confirmations = []

    for agent in agents:

        message = private_confirmation_message(
            agent.student_id,
            outcome.agreed_slot,
        )

        with st.container(border=True):

            st.markdown(
                f"### 🔒 {agent.student_id} ↔ Cubbie"
            )

            st.write(message.text)

            confirmed = st.checkbox(
                "Confirm",
                key=f"confirm-{agent.student_id}",
            )

            confirmations.append(confirmed)

    if all(confirmations):

        st.success(
            f"🎉 Everyone confirmed "
            f"{outcome.agreed_slot}."
        )

        st.caption(
            "No private scheduling reasons "
            "were exposed to the group."
        )


# -------------------------
# Privacy challenge
# -------------------------

st.divider()

st.subheader("Try the privacy boundary")

privacy_question = st.text_input(
    "Ask something the group should not learn",
    placeholder="Who can't make Friday?",
)

if privacy_question:

    response = privacy_response(
        privacy_question
    )

    with st.chat_message("assistant"):
        st.markdown("**Cubbie**")
        st.write(response.text)