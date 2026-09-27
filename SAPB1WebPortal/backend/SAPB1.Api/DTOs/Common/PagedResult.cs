namespace SAPB1.Api.DTOs.Common;

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

/// <summary>
/// Common paging/search/filter query parameters. Bound from the query string,
/// e.g. GET /api/customers?page=1&amp;pageSize=20&amp;search=acme&amp;active=true
/// </summary>
public class PagedRequest
{
    private const int MaxPageSize = 200;
    private int _pageSize = 20;

    public int Page { get; set; } = 1;

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value <= 0 ? 20 : Math.Min(value, MaxPageSize);
    }

    public string? Search { get; set; }
    public bool? Active { get; set; }

    public int Skip => (Math.Max(Page, 1) - 1) * PageSize;
}
