namespace SAPB1.Api.Services;

/// <summary>
/// Client rule: deliveries to customers of the "InterCompany" customer group are not real pending business, so they are never shown or counted as
/// open deliveries (Pending Deliveries / Pending Billing, the dashboard counts and the report). The group is matched by NAME (any customer group
/// whose name contains "InterCompany", e.g. "InterCompany - C"), so it keeps working if a new inter-company group is added in SAP.
/// </summary>
public static class DeliveryRules
{
    public const string GroupNamePattern = "%InterCompany%";

    /// <summary>Predicate (no leading AND) for a delivery header with alias <paramref name="deliveryAlias"/>.</summary>
    public static string ExcludeIntercompany(string deliveryAlias) =>
        $"NOT EXISTS (SELECT 1 FROM OCRD xc JOIN OCRG xg ON xg.GroupCode = xc.GroupCode WHERE xc.CardCode = {deliveryAlias}.CardCode AND xg.GroupName LIKE '{GroupNamePattern}')";

    /// <summary>The same predicate (with a leading AND) for queries that use the un-aliased table name ODLN — usable inside constant SQL strings.</summary>
    public const string AndExcludeIntercompanyUnaliased =
        " AND NOT EXISTS (SELECT 1 FROM OCRD xc JOIN OCRG xg ON xg.GroupCode = xc.GroupCode WHERE xc.CardCode = ODLN.CardCode AND xg.GroupName LIKE '%InterCompany%')";
}
