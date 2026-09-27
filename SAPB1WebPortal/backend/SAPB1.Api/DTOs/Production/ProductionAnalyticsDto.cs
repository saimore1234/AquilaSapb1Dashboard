namespace SAPB1.Api.DTOs.Production;

public class ProductionByPeriodDto
{
    public string Period { get; set; } = string.Empty; // e.g. "2026-09"
    public int OrderCount { get; set; }
    public double PlannedQty { get; set; }
    public double ProducedQty { get; set; }
}

public class ProductionByItemDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public double Quantity { get; set; }
}

public class ProductionByWarehouseDto
{
    public string WarehouseCode { get; set; } = string.Empty;
    public string? WarehouseName { get; set; }
    public int OrderCount { get; set; }
    public double ProducedQty { get; set; }
}

public class ProductionByStatusDto
{
    public string Status { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class ProductionAnalyticsDto
{
    /// <summary>Last 12 months of production orders, oldest first.</summary>
    public List<ProductionByPeriodDto> ProductionByMonth { get; set; } = new();

    public List<ProductionByStatusDto> ProductionByStatus { get; set; } = new();

    /// <summary>Top 10 finished goods by produced (CmpltQty) quantity.</summary>
    public List<ProductionByItemDto> TopProducedItems { get; set; } = new();

    /// <summary>Top 10 raw materials by issued (WOR1.IssuedQty) quantity.</summary>
    public List<ProductionByItemDto> TopConsumedMaterials { get; set; } = new();

    public List<ProductionByWarehouseDto> ProductionByWarehouse { get; set; } = new();

    public double OpenPlannedQuantity { get; set; }
    public double OpenProducedQuantity { get; set; }
    public decimal OpenProductionValue { get; set; }
}
