# Reliability

Reliability rules for this project:

- filesystem writes should be staged and validated where practical
- destructive actions should support backup or rollback unless explicitly impossible
- operations should produce structured status updates
- app startup should tolerate missing config and first-run state
- external API failures must degrade gracefully

Operational priority:

The app must never leave the user unsure whether a mod install partially succeeded.
