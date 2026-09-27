namespace SAPB1.Api.DTOs.Production;

public class ProductionDashboardDto
{
    public int TotalProductionOrders { get; set; }
    public int OpenProductionOrders { get; set; }
    public int PlannedProductionOrders { get; set; }
    public int ReleasedProductionOrders { get; set; }
    public int InProgressProductionOrders { get; set; }
    public int CompletedProductionOrders { get; set; }
    public int ClosedProductionOrders { get; set; }
    public int CancelledProductionOrders { get; set; }

    public double TotalPlannedQuantity { get; set; }
    public double TotalProducedQuantity { get; set; }
    public double PendingProductionQuantity { get; set; }

    public int ProductionOrdersThisMonth { get; set; }
    public int ProductionOrdersThisYear { get; set; }

    /// <summary>Total component quantity issued to production orders posted this month (WOR1.IssuedQty) — a quantity metric, not a currency value (no reliable per-line cost is available without further verification).</summary>
    public double MaterialConsumptionThisMonth { get; set; }

    /// <summary>Sum of CmpltQty * OITM.AvgPrice for orders posted this month — reuses the same AvgPrice-based valuation already used for stock value elsewhere in this portal.</summary>
    public decimal ProductionValueThisMonth { get; set; }
}
