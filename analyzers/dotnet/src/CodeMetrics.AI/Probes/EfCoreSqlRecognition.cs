using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace CodeMetrics.AI.Probes;

/// <summary>Distinguishes EF Core SQL text from parameterized values using the bound overload.</summary>
internal static class EfCoreSqlRecognition
{
    public static IEnumerable<ArgumentSyntax> SqlTextArguments(InvocationExpressionSyntax invocation, SemanticModel model)
    {
        if (model.GetOperation(invocation) is not IInvocationOperation operation || !IsEfSqlMethod(operation.TargetMethod))
            return invocation.ArgumentList.Arguments;

        var sql = operation.Arguments.FirstOrDefault(argument => argument.Parameter?.Name == "sql");
        if (sql == null) return invocation.ArgumentList.Arguments;

        // EF retains the format and arguments and creates database parameters.
        // A string-taking Raw overload does not provide that guarantee.
        if (sql.Parameter!.Type.ToDisplayString() == "System.FormattableString") return [];

        // Interpolation/concatenation in separately supplied parameter values is not SQL construction.
        // Match syntax rather than argument position to support named and static extension calls.
        return invocation.ArgumentList.Arguments.Where(argument => argument.Span.Contains(sql.Value.Syntax.Span));
    }

    private static bool IsEfSqlMethod(IMethodSymbol method)
    {
        var definition = method.ReducedFrom ?? method;
        if (definition.ContainingAssembly.Name != "Microsoft.EntityFrameworkCore.Relational" ||
            definition.ContainingNamespace.ToDisplayString() != "Microsoft.EntityFrameworkCore") return false;

        return definition.ContainingType.Name switch
        {
            "RelationalQueryableExtensions" => definition.Name is "FromSql" or "FromSqlInterpolated" or "FromSqlRaw",
            "RelationalDatabaseFacadeExtensions" => definition.Name is
                "ExecuteSql" or "ExecuteSqlAsync" or "ExecuteSqlInterpolated" or "ExecuteSqlInterpolatedAsync" or
                "ExecuteSqlRaw" or "ExecuteSqlRawAsync" or "SqlQuery" or "SqlQueryRaw",
            _ => false
        };
    }
}
