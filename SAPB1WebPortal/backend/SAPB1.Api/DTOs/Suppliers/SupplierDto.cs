namespace SAPB1.Api.DTOs.Suppliers;

public class SupplierListItemDto
{
    public string CardCode { get; set; } = string.Empty;
    public string CardName { get; set; } = string.Empty;
    public string? GroupName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public decimal Balance { get; set; }
    public decimal CreditLimit { get; set; }
    public bool Active { get; set; }
}

public class SupplierDetailDto
{
    public string CardCode { get; set; } = string.Empty;
    public string CardName { get; set; } = string.Empty;
    public string? GroupName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? GsTin { get; set; }
    public decimal CreditLimit { get; set; }
    public decimal Balance { get; set; }
    public bool Active { get; set; }
    public List<SupplierAddressDto> Addresses { get; set; } = new();
}

public class SupplierAddressDto
{
    public string AddressType { get; set; } = string.Empty;
    public string? Street { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }
}
