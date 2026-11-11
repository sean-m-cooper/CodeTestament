# CodeTestament Scorecard 2.4.1

This .NET patch addresses reviewed hardcoded-secret false positives without
changing the numerical Security scoring ladder.

- A descriptive constant such as
  `PaymentCardTokenRecordType = "paymentcardtoken"` is recognized as an identifier.
  An unrelated credential value with the same declaration name still produces a
  finding.
- CMAI4001 accepts a scoped annotation with a nonempty rationale for reviewed
  false positives. This supports secret-store identifiers passed through internal
  wrappers whose implementation the analyzer cannot inspect. The specific rule
  code is required; category names, `all` and `*` do not suppress it.
- The packaged JSON and Markdown rule catalogs describe the annotation so the
  scorecard skill can offer guidance for the analyzer version actually used.

```csharp
// codemetrics-ignore: CMAI4001 -- AWS secret identifier; credential retrieved at runtime.
const string secret = "FortisPayment.Settings";
```

The annotation records developer-reviewed intent. It does not establish that
the wrapper retrieves a secret, and it does not suppress other security rules.
Prefer a declaration or assignment annotation over a containing-member scope.

## Upgrade

```sh
dotnet tool update --global CodeTestament.Scorecard --version 2.4.1
```

CodeTestament plugin 0.2.2 selects .NET 2.4.1 by default. Existing supported exact
repository pins remain honored, including 2.4.0; update those pins explicitly
when adopting this release. JS/TS stays on 0.5.1 and Python on
0.6.0-preview.3. No npm package is changed by this release.

The new ruleset is `dotnet-2026-11-11-secret-identifier-context`. Classification
and annotation changes can change Security scores on unchanged source. Preserve
historical evidence and generate a fresh baseline after reviewing the change;
do not rewrite old evidence to make cross-version gates pass.
