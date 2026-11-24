# CodeTestament Scorecard 2.4.3

EF Core's parameterizing SQL APIs no longer lower the Security score simply
because their arguments use interpolation. The analyzer now checks the resolved
EF Core method and SQL parameter type. This fixes `FromSqlInterpolated` query
chains and `ExecuteSqlInterpolatedAsync` calls with cancellation tokens, along
with the other supported `FormattableString` SQL overloads.

Interpolation and concatenation directly in SQL text passed to raw APIs remain
findings. Separately supplied parameter values are not treated as SQL text.
Custom methods with similar names do not receive an EF Core exemption.

```sh
dotnet tool update --global CodeTestament.Scorecard --version 2.4.3
```

CodeTestament plugin 0.2.5 selects .NET 2.4.3 by default. Update the plugin and
reload the host. Exact repository pins remain authoritative; update a pin to
2.4.3 explicitly to use this correction. JS/TS stays at 0.5.2, and the Python
bundle stays at 0.6.0-preview.4 with adapter 0.15.0 and Error Handling unscored.

Rerun the scorecard to replace the affected findings. For comparisons, regenerate
the baseline from its original source revision with the same analyzer version
used for the current branch. Do not edit old evidence or bypass compatibility
checks.

Regression tests use the actual EF Core relational library and cover both safe
parameterized calls and unsafe raw construction. The full .NET suite passes
1,207 tests. Numerical scoring rules are unchanged. A clean static Security score
does not establish that the application is secure. See the
[SQL detection policy](../dotnet-sql-security.md) for the recognition boundaries.
