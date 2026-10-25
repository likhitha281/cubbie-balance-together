import Link from "next/link";
import {
  MessageCircle,
  ShieldCheck,
  Users,
  Sparkles,
  LockKeyhole,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 md:px-8">
        {/* Navigation */}
        <nav className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
              <MessageCircle size={22} />
            </div>

            <div>
              <div className="font-semibold tracking-tight">
                Balance Together
              </div>
              <div className="text-xs text-slate-500">
                powered by Cubbie
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 shadow-sm sm:flex">
            <ShieldCheck size={15} className="text-violet-600" />
            Private by default
          </div>
        </nav>

        {/* Hero */}
        <section className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1fr_460px] lg:gap-20">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3.5 py-2 text-sm font-medium text-violet-700">
              <Sparkles size={16} />
              Your agents coordinate. Your reasons stay yours.
            </div>

            <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.045em] md:text-7xl">
              Make plans.
              <br />
              Keep the reasons
              <br />
              <span className="text-violet-600">private.</span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
              Create a group, invite your friends, and ask Cubbie to find
              a plan that works for everyone — without turning everyone&apos;s
              calendar into group business.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/create"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3.5 font-medium text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700"
              >
                <Users size={18} />
                Create a group
              </Link>

              <Link
                href="/join"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Join with a code
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <Users size={16} className="text-violet-500" />
                Real groups
              </span>

              <span className="flex items-center gap-2">
                <MessageCircle size={16} className="text-violet-500" />
                Agent coordination
              </span>

              <span className="flex items-center gap-2">
                <LockKeyhole size={16} className="text-violet-500" />
                Minimal disclosure
              </span>
            </div>
          </div>

          {/* Chat preview */}
          <div className="mx-auto w-full max-w-[430px]">
            <div className="overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_30px_80px_-25px_rgba(15,23,42,0.25)]">
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-rose-100 text-xl">
                  🍕
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Friday Night</div>
                  <div className="truncate text-xs text-slate-400">
                    Maya · Alex · Likhitha · Cubbie
                  </div>
                </div>

                <ShieldCheck size={19} className="text-violet-500" />
              </div>

              {/* Chat body */}
              <div className="min-h-[470px] space-y-5 bg-[#f3f4f8] px-4 py-5">
                <Message name="Maya" time="4:31 PM">
                  dinner this weekend?? 🍕
                </Message>

                <Message name="Alex" time="4:32 PM" mine>
                  yes i&apos;m so down 😭
                </Message>

                <Message name="Likhitha" time="4:32 PM">
                  <span className="font-medium text-violet-600">
                    @Cubbie
                  </span>{" "}
                  find something that works for everyone
                </Message>

                <CubbieMessage>
                  <p>
                    checking with everyone privately — give me a sec
                  </p>

                  <div className="mt-3 flex items-center gap-1.5 text-violet-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  </div>
                </CubbieMessage>

                <CubbieMessage>
                  <p>friday&apos;s looking tricky 👀</p>

                  <p className="mt-2">
                    <strong>saturday 6–8 PM</strong> looks much better
                    for the group.
                  </p>

                  <p className="mt-2 text-violet-100">
                    sunday could work too, but saturday needs less
                    compromise.
                  </p>

                  <button className="mt-4 w-full rounded-xl bg-white/15 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20">
                    Check privately with everyone
                  </button>
                </CubbieMessage>

                <div className="flex items-center justify-center gap-2 py-1 text-[11px] text-slate-400">
                  <LockKeyhole size={12} />
                  Private reasons stay out of the group chat
                </div>
              </div>

              {/* Composer */}
              <div className="flex items-center gap-3 border-t border-slate-100 bg-white p-3">
                <button className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500">
                  +
                </button>

                <div className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
                  Message Friday Night...
                </div>

                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                  ↑
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck size={13} />
              Familiar group chat. Private agent coordination underneath.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Message({
  name,
  time,
  children,
  mine = false,
}: {
  name: string;
  time: string;
  children: React.ReactNode;
  mine?: boolean;
}) {
  return (
    <div className={mine ? "flex justify-end" : ""}>
      <div className="max-w-[82%]">
        <div
          className={`mb-1 flex items-center gap-2 px-1 text-[11px] ${
            mine
              ? "justify-end text-slate-400"
              : "text-slate-500"
          }`}
        >
          <span className="font-medium">{name}</span>
          <span>{time}</span>
        </div>

        <div
          className={`rounded-2xl px-4 py-2.5 text-[14px] leading-6 shadow-sm ${
            mine
              ? "rounded-tr-md bg-[#d9fdd3]"
              : "rounded-tl-md bg-white"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function CubbieMessage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[88%]">
      <div className="mb-1 flex items-center gap-2 px-1 text-[11px] font-medium text-violet-600">
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[8px] text-white">
          C
        </div>
        Cubbie
      </div>

      <div className="rounded-2xl rounded-tl-md bg-violet-600 px-4 py-3 text-[14px] leading-6 text-white shadow-md shadow-violet-100">
        {children}
      </div>
    </div>
  );
}