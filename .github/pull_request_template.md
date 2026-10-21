<!-- Only for risk:high or risk:critical, one first line: Risk high: <what can break>. Otherwise none:
the risk lives in the risk:<level> label. Target 1,500 characters, never above 2,500. -->

<1-2 sentences: what changes and why. It must stand alone.>

<!-- One visual block, or none when the summary says it all (docs, dependency bump). Rules: What | Before |
After, max 3 rows, 12 words per cell, no file or code names. Flows: small Mermaid. Limits: values before and
after. Contracts or configuration: a diff block of at most 15 lines. -->

| What | Before | After |
| ---- | ------ | ----- |
|      |        |       |

<!-- Only for a real step (secret, variable, setting, merge order, release step), one line:
Deploy: <step>. Mention rollback only when a revert is not enough. Otherwise write nothing. -->
