# Deal files

Where audit output goes. **Everything in here is gitignored except this file.**

A deal file describes a real site — rent, address, parties, and quoted lease text in `verbatim`
fields. It is exactly the material that must never reach version control, which is why the
directory is ignored rather than merely conventional.

```
deals/
  <site>.deal.json     the deal file — authoritative, read by every tool
  <site>-audit.md      the audit report — what a human reviews
```

Set `confidential: true` on anything real. Synthetic examples belong in `fixtures/`, not here.

If you need this content somewhere shared, use whatever the client's document storage is. Do not
solve it by committing.
