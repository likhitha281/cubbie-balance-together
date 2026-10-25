# Cubbie Balance Together

> Privacy-aware multi-agent coordination for student life.

Cubbie Balance Together extends Cubbie Balance from one student's planning problem to a multi-student coordination problem.

Instead of asking students to expose their calendars, grades, coursework, work schedules, or private reasons for being unavailable, each student is represented by a personal Balance agent.

The agents negotiate using only the minimum information necessary to reach a shared plan.

## The Problem

Planning with friends or classmates often looks like this:

> "When are you free?"

But answering that question can reveal much more than necessary.

A student's availability may depend on:

- exams
- grades
- assignments
- work shifts
- interviews
- personal appointments
- recovery needs
- private calendar events

Cubbie Balance Together asks:

> **Can agents coordinate our time without sharing why we're available or unavailable?**

## Architecture

Each student's private context remains inside their personal agent.

```text
Private Student Context
        |
        v
   Balance Agent
        |
        v
   Privacy Filter
        |
        v
Shareable Constraint
        |
        +-------------------+
                            |
                     Other Agents
                            |
                            v
                       Negotiation
                            |
                            v
                    Tentative Agreement
                            |
                            v
                     Human Confirmation