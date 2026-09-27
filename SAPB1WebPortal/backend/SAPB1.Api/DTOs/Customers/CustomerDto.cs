namespace SAPB1.Api.DTOs.Customers;

/// <summary>Row shown in the customers list (OCRD summary).</summary>
public class CustomerListItemDto
{
    public string CardCode { get; set; } = string.Empty;
    public string CardName { get; set; } = string.Empty;
    public string? GroupName { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public string? SalesEmployee { get; set; }
    public decimal Balance { get; set; }
    public decimal CreditLimit { get; set; }
    public bool Active { get; set; }
}

/// <summary>Full customer detail (OCRD + CRD1 addresses + OCRG + OSLP).</summary>
public class CustomerDetailDto
{
    public string CardCode { get; set; } = string.Empty;
    public string CardName { get; set; } = string.Empty;
    public string? GroupName { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public string? GsTin { get; set; }
    public string? SalesEmployee { get; set; }
    public string? Territory { get; set; }
    public decimal CreditLimit { get; set; }
    public decimal Balance { get; set; }
    public bool Active { get; set; }
    public List<CustomerAddressDto> Addresses { get; set; } = new();
}

public class CustomerAddressDto
{
    public string AddressType { get; set; } = string.Empty; // "Bill-To" / "Ship-To"
    public string? Street { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }
}
