# .NET SQL security detection

This correction is implemented in development; the published .NET 2.4.2 analyzer
still uses the earlier syntax-only detection.

The analyzer checks the resolved EF Core method and SQL parameter type before
classifying interpolation. EF Core's `FormattableString` overloads preserve the
format string and convert interpolated values into database parameters:

- `FromSql` and `FromSqlInterpolated`
- `ExecuteSql`, `ExecuteSqlAsync`, `ExecuteSqlInterpolated` and `ExecuteSqlInterpolatedAsync`
- `SqlQuery<T>`

These calls do not produce `rawSqlInterpolation` findings. Recognition requires the
known extension class in `Microsoft.EntityFrameworkCore.Relational`, its namespace,
the resolved method, and the `sql` parameter's type. A custom method with a similar
name, or an unresolved call, does not receive this exemption.

For recognized `FromSqlRaw`, `ExecuteSqlRaw`, `ExecuteSqlRawAsync` and `SqlQueryRaw<T>`
calls, direct interpolation or concatenation in the SQL text remains a finding.
Expressions used as separately supplied parameter values are not SQL text and do
not produce findings. Named arguments, static extension calls, cancellation tokens
and subsequent LINQ composition preserve this distinction.

```csharp
// Parameterized values: no rawSqlInterpolation finding.
db.Photos.FromSqlInterpolated($"SELECT * FROM Photos WHERE Id = {id}");
db.Database.ExecuteSqlRaw("DELETE FROM Photos WHERE Name = {0}", $"prefix-{id}");

// SQL text assembled from a value: retain the finding.
db.Database.ExecuteSqlRaw($"DELETE FROM Photos WHERE Id = {id}");
```

Regression tests compile against the actual EF Core relational library and verify
both findings and their effect on the security score. They cover the reported
query-with-lock-hints pattern and async update with a cancellation token.

This is bounded static pattern recognition, not complete SQL taint analysis. It
does not prove authorization, business correctness, or application security, and
does not change the numerical security scoring ladder. See Microsoft's
[EF Core SQL query documentation](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries)
for parameterization and raw SQL behavior.
