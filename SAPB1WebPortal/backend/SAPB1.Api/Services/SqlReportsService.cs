using System.Data;
using Dapper;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Finance;
using SAPB1.Api.DTOs.Reports;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Backs the handful of Reports Center endpoints that have no existing
/// module to reuse. GetManagementSummaryAsync is pure composition over the
/// already-built Sales/Purchase/Production/Finance services (zero new SQL,
/// zero duplicated business logic). The stock ageing/movement queries are
/// genuinely new — the Inventory module never needed a "how old is this
/// stock" or "transaction ledger" view before — built against the exact same
/// OITW/OITM/OWHS/OINM tables and columns already verified in
/// SqlSapB1Service (Inventory) and SqlProductionService (which already uses
/// OINM for production receipts).
///
/// Stock ageing "age" is measured from each item/warehouse's most recent
/// INBOUND OINM movement (InQty &gt; 0) to today. Rows with on-hand stock but
/// no OINM history at all (e.g. an opening-balance stock figure entered
/// directly, as this project's own Finance module already found this
/// installation does for its "Stock" G/L account — see SqlFinanceService
/// class docs) are honestly labelled "No Movement History" rather than
/// assigned a fabricated age.
/// </summary>
public class SqlReportsService : IReportsService
{
    private readonly ICompanyConnectionFactory _connectionFactory;
    private readonly ISalesService _salesService;
    private readonly IPurchaseService _purchaseService;
    private readonly IProductionService _productionService;
    private readonly IFinanceService _financeService;

    public SqlReportsService(
        ICompanyConnectionFactory connectionFactory,
        ISalesService salesService,
        IPurchaseService purchaseService,
        IProductionService productionService,
        IFinanceService financeService)
    {
        _connectionFactory = connectionFactory;
        _salesService = salesService;
        _purchaseService = purchaseService;
        _productionService = productionService;
        _financeService = financeService;
    }

    public async Task<ManagementSummaryDto> GetManagementSummaryAsync(CancellationToken ct = default)
    {
        var salesTask = _salesService.GetDashboardAsync(ct);
        var purchaseTask = _purchaseService.GetDashboardAsync(ct);
        var productionTask = _productionService.GetDashboardAsync(ct);
        var financeTask = _financeService.GetDashboardAsync(ct);
        var balanceSheetTask = _financeService.GetBalanceSheetAsync(null, ct);
        await Task.WhenAll(salesTask, purchaseTask, productionTask, financeTask, balanceSheetTask);

        var sales = salesTask.Result;
        var purchase = purchaseTask.Result;
        var production = productionTask.Result;
        var finance = financeTask.Result;
        var balanceSheet = balanceSheetTask.Result;

        return new ManagementSummaryDto
        {
            SalesThisMonth = sales.MonthlySalesValue,
            PurchasesThisMonth = purchase.MonthlyPurchaseValue,
            Revenue = finance.SalesThisMonth,
            Expenses = finance.PurchasesThisMonth,
            Receivables = finance.TotalReceivables,
            Payables = finance.TotalPayables,
            CashBalance = finance.CashBalance,
            BankBalance = finance.BankBalance,
            InventoryValue = balanceSheet.Inventory,
            NetProfitThisMonth = finance.NetProfitThisMonth,
            OpenSalesOrders = sales.OpenSalesOrders,
            OpenPurchaseOrders = purchase.OpenPurchaseOrders,
            OpenProductionOrders = production.OpenProductionOrders,
            WorkingCapitalEstimate = finance.TotalReceivables + finance.CashBalance + finance.BankBalance - finance.TotalPayables
        };
    }

    private static (string Bucket, int? Days) ClassifyStockAge(DateTime? lastReceiptDate, DateTime reportingDate)
    {
        if (lastReceiptDate is null) return ("No Movement History", null);
        var days = (reportingDate.Date - lastReceiptDate.Value.Date).Days;
        var bucket = days switch
        {
            <= 30 => "0-30",
            <= 60 => "31-60",
            <= 90 => "61-90",
            <= 180 => "91-180",
            _ => "180+"
        };
        return (bucket, days);
    }

    public async Task<PagedResult<StockAgeingRowDto>> GetStockAgeingAsync(StockAgeingQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var reportingDate = DateTime.Today;

        const string sql = @"
            SELECT w.ItemCode, i.ItemName, w.WhsCode AS WarehouseCode, wh.WhsName AS WarehouseName,
                   w.OnHand, w.StockValue,
                   (SELECT MAX(n.DocDate) FROM OINM n WHERE n.ItemCode = w.ItemCode AND n.Warehouse = w.WhsCode AND n.InQty > 0) AS LastReceiptDate
            FROM OITW w
            LEFT JOIN OITM i ON i.ItemCode = w.ItemCode
            LEFT JOIN OWHS wh ON wh.WhsCode = w.WhsCode
            WHERE w.OnHand > 0
              AND (@Search IS NULL OR w.ItemCode LIKE @SearchLike OR i.ItemName LIKE @SearchLike)
              AND (@Warehouse IS NULL OR w.WhsCode = @Warehouse)
            ORDER BY w.ItemCode, w.WhsCode";

        var p = new
        {
            Search = query.Search,
            SearchLike = query.Search is null ? null : $"%{query.Search}%",
            Warehouse = query.Warehouse
        };

        var rows = (await db.QueryAsync(new CommandDefinition(sql, p, cancellationToken: ct))).ToList();
        var all = rows.Select(r =>
        {
            DateTime? lastReceipt = r.LastReceiptDate;
            var (bucket, days) = ClassifyStockAge(lastReceipt, reportingDate);
            return new StockAgeingRowDto
            {
                ItemCode = r.ItemCode, ItemName = r.ItemName, WarehouseCode = r.WarehouseCode, WarehouseName = r.WarehouseName,
                OnHand = (double)r.OnHand, StockValue = r.StockValue, LastReceiptDate = lastReceipt, AgeDays = days, AgeingBucket = bucket
            };
        }).Where(r => query.AgeingBucket is null || r.AgeingBucket == query.AgeingBucket).ToList();

        var total = all.Count;
        var page = all.Skip(query.Skip).Take(query.PageSize).ToList();

        return new PagedResult<StockAgeingRowDto> { Items = page, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<PagedResult<InventoryMovementDto>> GetInventoryMovementAsync(InventoryMovementQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string filterSql = @"
            WHERE (@Search IS NULL OR CAST(n.TransNum AS NVARCHAR(20)) LIKE @SearchLike OR n.ItemCode LIKE @SearchLike OR i.ItemName LIKE @SearchLike OR n.Dscription LIKE @SearchLike)
              AND (@DateFrom IS NULL OR n.DocDate >= @DateFrom)
              AND (@DateTo IS NULL OR n.DocDate <= @DateTo)
              AND (@Item IS NULL OR n.ItemCode = @Item)
              AND (@Warehouse IS NULL OR n.Warehouse = @Warehouse)";

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Item", query.Item);
        p.Add("Warehouse", query.Warehouse);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM OINM n LEFT JOIN OITM i ON i.ItemCode = n.ItemCode {filterSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT n.TransNum, n.DocDate AS PostingDate, n.ItemCode, i.ItemName, n.Warehouse,
                   n.InQty, n.OutQty, n.TransType AS TransactionType, n.Dscription AS Description
            FROM OINM n
            LEFT JOIN OITM i ON i.ItemCode = n.ItemCode
            {filterSql}
            ORDER BY n.DocDate DESC, n.TransNum DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = (await db.QueryAsync<InventoryMovementDto>(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();

        return new PagedResult<InventoryMovementDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }
}
