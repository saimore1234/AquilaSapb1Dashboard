/* ============================================================================================================
   Sales dashboard reconciliation checks — READ ONLY. Run in SSMS (database is selected below).
   Generated from the exact SQL used by the portal's reports (Services/SqlSalesDetailReportsService.cs), so a figure
   here is the figure the report/KPI should show for the same dates. Change @From / @To to the dashboard's selected period.
   Compare each result with the dashboard tile / report footer and with the client's own report. Send me the grids.
   ============================================================================================================ */
USE AOPL_LIVE_BRANCH;
GO
SET NOCOUNT ON;
DECLARE @From datetime = '20260401', @To datetime = '20260930', @Ref datetime = '20260930';
DECLARE @Whs nvarchar(8) = NULL, @Unit int = NULL, @Branch int = NULL, @Slp int = NULL, @Customer nvarchar(50) = NULL,
        @CustGroup int = NULL, @Cat nvarchar(50) = NULL, @ItemLike nvarchar(100) = NULL, @Sgn int = NULL;

PRINT '=== A1. OPEN SALES ORDERS (line level, client definition) — must equal the KPI tile and the report footer ===';
SELECT COUNT(*) AS OpenLines, COUNT(DISTINCT h.DocEntry) AS DistinctOrders,
       CAST(SUM(l.Quantity) AS decimal(18,3)) AS OrderedQty, CAST(SUM(l.OpenCreQty) AS decimal(18,3)) AS OpenQty, CAST(SUM(l.LineTotal) AS decimal(18,2)) AS FullLineTotal

        FROM ORDR h
        JOIN RDR1 l ON l.DocEntry = h.DocEntry
        LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
        LEFT JOIN OWHS w ON w.WhsCode = l.WhsCode
        LEFT JOIN OLCT u ON u.Code = l.LocCode
        LEFT JOIN OSLP s ON s.SlpCode = (CASE WHEN l.SlpCode IS NULL OR l.SlpCode = -1 THEN h.SlpCode ELSE l.SlpCode END)
        LEFT JOIN OCRD c ON c.CardCode = h.CardCode
        WHERE h.CANCELED = 'N' AND l.LineStatus = 'O'
          AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
          AND (@Whs IS NULL OR l.WhsCode = @Whs)
          AND (@Unit IS NULL OR l.LocCode = @Unit)
          AND (@Branch IS NULL OR h.BPLId = @Branch)
          AND (@Slp IS NULL OR (CASE WHEN l.SlpCode IS NULL OR l.SlpCode = -1 THEN h.SlpCode ELSE l.SlpCode END) = @Slp)
          AND (@Customer IS NULL OR h.CardCode = @Customer)
          AND (@CustGroup IS NULL OR c.GroupCode = @CustGroup)
          AND (@ItemLike IS NULL OR l.ItemCode LIKE @ItemLike OR l.Dscription LIKE @ItemLike)
          AND (@Cat IS NULL OR CASE WHEN i.QryGroup1 = 'Y' THEN 'Trading' WHEN i.QryGroup2 = 'Y' THEN 'Manufacturing' WHEN i.QryGroup3 = 'Y' THEN 'Ring' WHEN i.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END = @Cat);

PRINT '=== A2. Duplicate check: the report joins must not multiply lines (both numbers must be equal) ===';
SELECT (SELECT COUNT(*) FROM ORDR h0 JOIN RDR1 l0 ON l0.DocEntry = h0.DocEntry WHERE h0.CANCELED = 'N' AND l0.LineStatus = 'O'
          AND h0.DocDate >= @From AND h0.DocDate < DATEADD(DAY, 1, @To)) AS LinesWithoutDimensionJoins,
       (SELECT COUNT(*) 
FROM ORDR h
JOIN RDR1 l ON l.DocEntry = h.DocEntry
LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
LEFT JOIN OWHS w ON w.WhsCode = l.WhsCode
LEFT JOIN OLCT u ON u.Code = l.LocCode
LEFT JOIN OSLP s ON s.SlpCode = (CASE WHEN l.SlpCode IS NULL OR l.SlpCode = -1 THEN h.SlpCode ELSE l.SlpCode END)
LEFT JOIN OCRD c ON c.CardCode = h.CardCode
WHERE h.CANCELED = 'N' AND l.LineStatus = 'O'
AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
AND (@Whs IS NULL OR l.WhsCode = @Whs)
AND (@Unit IS NULL OR l.LocCode = @Unit)
AND (@Branch IS NULL OR h.BPLId = @Branch)
AND (@Slp IS NULL OR (CASE WHEN l.SlpCode IS NULL OR l.SlpCode = -1 THEN h.SlpCode ELSE l.SlpCode END) = @Slp)
AND (@Customer IS NULL OR h.CardCode = @Customer)
AND (@CustGroup IS NULL OR c.GroupCode = @CustGroup)
AND (@ItemLike IS NULL OR l.ItemCode LIKE @ItemLike OR l.Dscription LIKE @ItemLike)
AND (@Cat IS NULL OR CASE WHEN i.QryGroup1 = 'Y' THEN 'Trading' WHEN i.QryGroup2 = 'Y' THEN 'Manufacturing' WHEN i.QryGroup3 = 'Y' THEN 'Ring' WHEN i.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END = @Cat)) AS LinesWithAllJoins;

PRINT '=== A3. What the older portal tile showed (whole orders, DocTotal incl. tax, all dates) — for the before/after comparison ===';
SELECT COUNT(*) AS OpenOrders, CAST(SUM(DocTotal) AS decimal(18,2)) AS DocTotalInclTax FROM ORDR WHERE DocStatus = 'O' AND CANCELED = 'N';

PRINT '=== B1. TOTAL OUTSTANDING as of @Ref, client ageing logic (journal based) — must equal the KPI tile and report total ===';

        WITH oi AS (
            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName) AS ShortName, T0.RefDate AS PostingDate, T0.DueDate,
                   MAX(T0.TransType) AS TransType, MAX(T0.BaseRef) AS BaseRef, MAX(T0.Ref1) AS Ref1,
                   (MAX(T0.BalDueCred) + SUM(T1.ReconSum)) AS Bal
            FROM JDT1 T0
            INNER JOIN ITR1 T1 ON T1.TransId = T0.TransId AND T1.TransRowId = T0.Line_ID
            INNER JOIN OITR T2 ON T2.ReconNum = T1.ReconNum
            INNER JOIN OJDT T3 ON T3.TransId = T0.TransId
            INNER JOIN OCRD T4 ON T4.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T5 ON T5.ObjType = T0.TransType AND T5.DocEntry = T0.CreatedBy
                AND (T5.TransType <> 'I' OR (T5.TransType = 'I' AND T5.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T4.CardType = 'C' AND (@Customer IS NULL OR T4.CardCode = @Customer)
              AND T2.ReconDate > @Ref AND T1.IsCredit = 'C'
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
            HAVING MAX(T0.BalFcCred) <> -SUM(T1.ReconSumFC) OR MAX(T0.BalDueCred) <> -SUM(T1.ReconSum)

            UNION ALL

            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName), T0.RefDate, T0.DueDate,
                   MAX(T0.TransType), MAX(T0.BaseRef), MAX(T0.Ref1),
                   (- MAX(T0.BalDueDeb) - SUM(T1.ReconSum))
            FROM JDT1 T0
            INNER JOIN ITR1 T1 ON T1.TransId = T0.TransId AND T1.TransRowId = T0.Line_ID
            INNER JOIN OITR T2 ON T2.ReconNum = T1.ReconNum
            INNER JOIN OJDT T3 ON T3.TransId = T0.TransId
            INNER JOIN OCRD T4 ON T4.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T5 ON T5.ObjType = T0.TransType AND T5.DocEntry = T0.CreatedBy
                AND (T5.TransType <> 'I' OR (T5.TransType = 'I' AND T5.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T4.CardType = 'C' AND (@Customer IS NULL OR T4.CardCode = @Customer)
              AND T2.ReconDate > @Ref AND T1.IsCredit = 'D'
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
            HAVING MAX(T0.BalFcDeb) <> -SUM(T1.ReconSumFC) OR MAX(T0.BalDueDeb) <> -SUM(T1.ReconSum)

            UNION ALL

            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName), T0.RefDate, T0.DueDate,
                   MAX(T0.TransType), MAX(T0.BaseRef), MAX(T0.Ref1),
                   (MAX(T0.BalDueCred) - MAX(T0.BalDueDeb))
            FROM JDT1 T0
            INNER JOIN OJDT T1 ON T1.TransId = T0.TransId
            INNER JOIN OCRD T2 ON T2.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T3 ON T3.ObjType = T0.TransType AND T3.DocEntry = T0.CreatedBy
                AND (T3.TransType <> 'I' OR (T3.TransType = 'I' AND T3.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T2.CardType = 'C' AND (@Customer IS NULL OR T2.CardCode = @Customer)
              AND (T0.BalDueCred <> T0.BalDueDeb OR T0.BalFcCred <> T0.BalFcDeb)
              AND NOT EXISTS (
                  SELECT U0.TransId, U0.TransRowId FROM ITR1 U0 INNER JOIN OITR U1 ON U1.ReconNum = U0.ReconNum
                  WHERE T0.TransId = U0.TransId AND T0.Line_ID = U0.TransRowId AND U1.ReconDate > @Ref
                  GROUP BY U0.TransId, U0.TransRowId)
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
        ), x AS (
            SELECT oi.TransId, oi.BPLId, oi.ShortName AS CardCode, c.CardName, c.SlpCode, oi.PostingDate, oi.DueDate, oi.TransType, oi.BaseRef, oi.Ref1,
                   DATEDIFF(DAY, oi.PostingDate, @Ref) AS Days, -oi.Bal AS Balance
            FROM oi
            INNER JOIN OCRD c ON c.CardCode = oi.ShortName
            INNER JOIN CRD1 b ON b.CardCode = c.CardCode AND b.AdresType = 'B' AND c.BillToDef = b.Address
            WHERE (@Branch IS NULL OR oi.BPLId = @Branch)
        )
SELECT CAST(SUM(x.Balance) AS decimal(18,2)) AS TotalOutstanding, COUNT(DISTINCT x.CardCode) AS Customers FROM x;

PRINT '=== B2. Same by branch ===';

        WITH oi AS (
            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName) AS ShortName, T0.RefDate AS PostingDate, T0.DueDate,
                   MAX(T0.TransType) AS TransType, MAX(T0.BaseRef) AS BaseRef, MAX(T0.Ref1) AS Ref1,
                   (MAX(T0.BalDueCred) + SUM(T1.ReconSum)) AS Bal
            FROM JDT1 T0
            INNER JOIN ITR1 T1 ON T1.TransId = T0.TransId AND T1.TransRowId = T0.Line_ID
            INNER JOIN OITR T2 ON T2.ReconNum = T1.ReconNum
            INNER JOIN OJDT T3 ON T3.TransId = T0.TransId
            INNER JOIN OCRD T4 ON T4.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T5 ON T5.ObjType = T0.TransType AND T5.DocEntry = T0.CreatedBy
                AND (T5.TransType <> 'I' OR (T5.TransType = 'I' AND T5.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T4.CardType = 'C' AND (@Customer IS NULL OR T4.CardCode = @Customer)
              AND T2.ReconDate > @Ref AND T1.IsCredit = 'C'
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
            HAVING MAX(T0.BalFcCred) <> -SUM(T1.ReconSumFC) OR MAX(T0.BalDueCred) <> -SUM(T1.ReconSum)

            UNION ALL

            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName), T0.RefDate, T0.DueDate,
                   MAX(T0.TransType), MAX(T0.BaseRef), MAX(T0.Ref1),
                   (- MAX(T0.BalDueDeb) - SUM(T1.ReconSum))
            FROM JDT1 T0
            INNER JOIN ITR1 T1 ON T1.TransId = T0.TransId AND T1.TransRowId = T0.Line_ID
            INNER JOIN OITR T2 ON T2.ReconNum = T1.ReconNum
            INNER JOIN OJDT T3 ON T3.TransId = T0.TransId
            INNER JOIN OCRD T4 ON T4.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T5 ON T5.ObjType = T0.TransType AND T5.DocEntry = T0.CreatedBy
                AND (T5.TransType <> 'I' OR (T5.TransType = 'I' AND T5.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T4.CardType = 'C' AND (@Customer IS NULL OR T4.CardCode = @Customer)
              AND T2.ReconDate > @Ref AND T1.IsCredit = 'D'
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
            HAVING MAX(T0.BalFcDeb) <> -SUM(T1.ReconSumFC) OR MAX(T0.BalDueDeb) <> -SUM(T1.ReconSum)

            UNION ALL

            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName), T0.RefDate, T0.DueDate,
                   MAX(T0.TransType), MAX(T0.BaseRef), MAX(T0.Ref1),
                   (MAX(T0.BalDueCred) - MAX(T0.BalDueDeb))
            FROM JDT1 T0
            INNER JOIN OJDT T1 ON T1.TransId = T0.TransId
            INNER JOIN OCRD T2 ON T2.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T3 ON T3.ObjType = T0.TransType AND T3.DocEntry = T0.CreatedBy
                AND (T3.TransType <> 'I' OR (T3.TransType = 'I' AND T3.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T2.CardType = 'C' AND (@Customer IS NULL OR T2.CardCode = @Customer)
              AND (T0.BalDueCred <> T0.BalDueDeb OR T0.BalFcCred <> T0.BalFcDeb)
              AND NOT EXISTS (
                  SELECT U0.TransId, U0.TransRowId FROM ITR1 U0 INNER JOIN OITR U1 ON U1.ReconNum = U0.ReconNum
                  WHERE T0.TransId = U0.TransId AND T0.Line_ID = U0.TransRowId AND U1.ReconDate > @Ref
                  GROUP BY U0.TransId, U0.TransRowId)
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
        ), x AS (
            SELECT oi.TransId, oi.BPLId, oi.ShortName AS CardCode, c.CardName, c.SlpCode, oi.PostingDate, oi.DueDate, oi.TransType, oi.BaseRef, oi.Ref1,
                   DATEDIFF(DAY, oi.PostingDate, @Ref) AS Days, -oi.Bal AS Balance
            FROM oi
            INNER JOIN OCRD c ON c.CardCode = oi.ShortName
            INNER JOIN CRD1 b ON b.CardCode = c.CardCode AND b.AdresType = 'B' AND c.BillToDef = b.Address
            WHERE (@Branch IS NULL OR oi.BPLId = @Branch)
        )
SELECT x.BPLId, ISNULL(b.BPLName, '(none)') AS Branch, CAST(SUM(x.Balance) AS decimal(18,2)) AS Outstanding
FROM x LEFT JOIN OBPL b ON b.BPLId = x.BPLId GROUP BY x.BPLId, b.BPLName ORDER BY 3 DESC;

PRINT '=== B3. Cross-checks for B1 (only meaningful when @Ref is today): customer balance field, and the old invoice figure ===';
SELECT CAST(SUM(Balance) AS decimal(18,2)) AS OCRD_Balance_CustomersNow FROM OCRD WHERE CardType = 'C';
SELECT CAST(SUM(DocTotal - PaidToDate) AS decimal(18,2)) AS UnpaidInvoices_Today FROM OINV WHERE DocStatus = 'O' AND CANCELED = 'N';

PRINT '=== B4. Customers the client report would drop (no default bill-to address) but that carry a journal balance ===';
SELECT COUNT(*) AS CustomersWithBalanceButNoDefaultBillTo
FROM OCRD c WHERE c.CardType = 'C' AND ABS(c.Balance) > 0.005
  AND NOT EXISTS (SELECT 1 FROM CRD1 b WHERE b.CardCode = c.CardCode AND b.AdresType = 'B' AND b.Address = c.BillToDef);

PRINT '=== C1. SALES REGISTER total (net sales, excl. tax) — must equal Total Turnover with "Net of credit notes", Include Tax off, all units ===';

        WITH reg AS (
            SELECT 1 AS Sgn, 'A/R Invoice' AS DocType, h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum AS LineTax,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) AS LineSum
            FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
            UNION ALL
            SELECT -1, 'A/R Credit Memo', h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry)
            FROM ORIN h JOIN RIN1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
        ), x AS (
            SELECT r.Sgn, r.DocType, r.DocEntry, r.DocNum, r.DocDate AS PostingDate, r.CardCode AS CustomerCode, r.CardName AS CustomerName,
                   c.GroupCode AS CustGroupCode, g.GroupName AS CustomerGroup, r.SlpCode, s.SlpName AS Salesperson, r.BPLId, r.LocCode, r.WhsCode,
                   r.ItemCode, r.Dscription AS ItemDescription, ProdCat = CASE WHEN i.QryGroup1 = 'Y' THEN 'Trading' WHEN i.QryGroup2 = 'Y' THEN 'Manufacturing' WHEN i.QryGroup3 = 'Y' THEN 'Ring' WHEN i.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END,
                   ISNULL(w.WhsName, r.WhsCode) AS Warehouse, u.Location AS Unit, r.LineNum,
                   r.Sgn * r.Quantity AS Quantity, r.Price AS Rate, r.Sgn * r.LineTotal AS BasicAmount,
                   r.Sgn * r.LineTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSales,
                   r.Sgn * r.LineTax AS TaxAmount,
                   r.Sgn * r.GTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSalesInclTax
            FROM reg r
            LEFT JOIN OCRD c ON c.CardCode = r.CardCode
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = r.SlpCode
            LEFT JOIN OITM i ON i.ItemCode = r.ItemCode
            LEFT JOIN OWHS w ON w.WhsCode = r.WhsCode
            LEFT JOIN OLCT u ON u.Code = r.LocCode
        )
SELECT COUNT(*) AS Lines, CAST(SUM(x.NetSales) AS decimal(18,2)) AS NetSales, CAST(SUM(x.NetSalesInclTax) AS decimal(18,2)) AS NetSalesInclTax,
       CAST(SUM(CASE WHEN x.Sgn = 1 THEN x.NetSales END) AS decimal(18,2)) AS InvoicesNet, CAST(SUM(CASE WHEN x.Sgn = -1 THEN x.NetSales END) AS decimal(18,2)) AS CreditMemosNet
FROM x;

PRINT '=== C2. Register by customer group — must equal the Turnover "Customer Group-wise" table (same basis) ===';

        WITH reg AS (
            SELECT 1 AS Sgn, 'A/R Invoice' AS DocType, h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum AS LineTax,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) AS LineSum
            FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
            UNION ALL
            SELECT -1, 'A/R Credit Memo', h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry)
            FROM ORIN h JOIN RIN1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
        ), x AS (
            SELECT r.Sgn, r.DocType, r.DocEntry, r.DocNum, r.DocDate AS PostingDate, r.CardCode AS CustomerCode, r.CardName AS CustomerName,
                   c.GroupCode AS CustGroupCode, g.GroupName AS CustomerGroup, r.SlpCode, s.SlpName AS Salesperson, r.BPLId, r.LocCode, r.WhsCode,
                   r.ItemCode, r.Dscription AS ItemDescription, ProdCat = CASE WHEN i.QryGroup1 = 'Y' THEN 'Trading' WHEN i.QryGroup2 = 'Y' THEN 'Manufacturing' WHEN i.QryGroup3 = 'Y' THEN 'Ring' WHEN i.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END,
                   ISNULL(w.WhsName, r.WhsCode) AS Warehouse, u.Location AS Unit, r.LineNum,
                   r.Sgn * r.Quantity AS Quantity, r.Price AS Rate, r.Sgn * r.LineTotal AS BasicAmount,
                   r.Sgn * r.LineTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSales,
                   r.Sgn * r.LineTax AS TaxAmount,
                   r.Sgn * r.GTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSalesInclTax
            FROM reg r
            LEFT JOIN OCRD c ON c.CardCode = r.CardCode
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = r.SlpCode
            LEFT JOIN OITM i ON i.ItemCode = r.ItemCode
            LEFT JOIN OWHS w ON w.WhsCode = r.WhsCode
            LEFT JOIN OLCT u ON u.Code = r.LocCode
        )
SELECT ISNULL(x.CustomerGroup, '(none)') AS CustomerGroup, CAST(SUM(x.NetSales) AS decimal(18,2)) AS NetSales FROM x GROUP BY x.CustomerGroup ORDER BY 2 DESC;

PRINT '=== C3. Register by unit (line location) — must equal the Unit-wise table ===';

        WITH reg AS (
            SELECT 1 AS Sgn, 'A/R Invoice' AS DocType, h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum AS LineTax,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) AS LineSum
            FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
            UNION ALL
            SELECT -1, 'A/R Credit Memo', h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry)
            FROM ORIN h JOIN RIN1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
        ), x AS (
            SELECT r.Sgn, r.DocType, r.DocEntry, r.DocNum, r.DocDate AS PostingDate, r.CardCode AS CustomerCode, r.CardName AS CustomerName,
                   c.GroupCode AS CustGroupCode, g.GroupName AS CustomerGroup, r.SlpCode, s.SlpName AS Salesperson, r.BPLId, r.LocCode, r.WhsCode,
                   r.ItemCode, r.Dscription AS ItemDescription, ProdCat = CASE WHEN i.QryGroup1 = 'Y' THEN 'Trading' WHEN i.QryGroup2 = 'Y' THEN 'Manufacturing' WHEN i.QryGroup3 = 'Y' THEN 'Ring' WHEN i.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END,
                   ISNULL(w.WhsName, r.WhsCode) AS Warehouse, u.Location AS Unit, r.LineNum,
                   r.Sgn * r.Quantity AS Quantity, r.Price AS Rate, r.Sgn * r.LineTotal AS BasicAmount,
                   r.Sgn * r.LineTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSales,
                   r.Sgn * r.LineTax AS TaxAmount,
                   r.Sgn * r.GTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSalesInclTax
            FROM reg r
            LEFT JOIN OCRD c ON c.CardCode = r.CardCode
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = r.SlpCode
            LEFT JOIN OITM i ON i.ItemCode = r.ItemCode
            LEFT JOIN OWHS w ON w.WhsCode = r.WhsCode
            LEFT JOIN OLCT u ON u.Code = r.LocCode
        )
SELECT ISNULL(x.Unit, '(none)') AS Unit, CAST(SUM(x.NetSales) AS decimal(18,2)) AS NetSales FROM x GROUP BY x.Unit ORDER BY 2 DESC;

PRINT '=== C4. Register by salesperson (document header) ===';

        WITH reg AS (
            SELECT 1 AS Sgn, 'A/R Invoice' AS DocType, h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum AS LineTax,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) AS LineSum
            FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
            UNION ALL
            SELECT -1, 'A/R Credit Memo', h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry)
            FROM ORIN h JOIN RIN1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
        ), x AS (
            SELECT r.Sgn, r.DocType, r.DocEntry, r.DocNum, r.DocDate AS PostingDate, r.CardCode AS CustomerCode, r.CardName AS CustomerName,
                   c.GroupCode AS CustGroupCode, g.GroupName AS CustomerGroup, r.SlpCode, s.SlpName AS Salesperson, r.BPLId, r.LocCode, r.WhsCode,
                   r.ItemCode, r.Dscription AS ItemDescription, ProdCat = CASE WHEN i.QryGroup1 = 'Y' THEN 'Trading' WHEN i.QryGroup2 = 'Y' THEN 'Manufacturing' WHEN i.QryGroup3 = 'Y' THEN 'Ring' WHEN i.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END,
                   ISNULL(w.WhsName, r.WhsCode) AS Warehouse, u.Location AS Unit, r.LineNum,
                   r.Sgn * r.Quantity AS Quantity, r.Price AS Rate, r.Sgn * r.LineTotal AS BasicAmount,
                   r.Sgn * r.LineTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSales,
                   r.Sgn * r.LineTax AS TaxAmount,
                   r.Sgn * r.GTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSalesInclTax
            FROM reg r
            LEFT JOIN OCRD c ON c.CardCode = r.CardCode
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = r.SlpCode
            LEFT JOIN OITM i ON i.ItemCode = r.ItemCode
            LEFT JOIN OWHS w ON w.WhsCode = r.WhsCode
            LEFT JOIN OLCT u ON u.Code = r.LocCode
        )
SELECT ISNULL(x.Salesperson, '(none)') AS Salesperson, CAST(SUM(x.NetSales) AS decimal(18,2)) AS NetSales FROM x GROUP BY x.Salesperson ORDER BY 2 DESC;

PRINT '=== D1. PRODUCT CATEGORY: items flagged in more than one of the query groups 1-4 (the CASE order decides: Trading > Manufacturing > Ring > Emerson Trading) ===';
SELECT COUNT(*) AS ItemsInMoreThanOneGroup FROM OITM
WHERE (CASE WHEN QryGroup1 = 'Y' THEN 1 ELSE 0 END + CASE WHEN QryGroup2 = 'Y' THEN 1 ELSE 0 END + CASE WHEN QryGroup3 = 'Y' THEN 1 ELSE 0 END + CASE WHEN QryGroup4 = 'Y' THEN 1 ELSE 0 END) > 1;
SELECT TOP 20 ItemCode, ItemName, QryGroup1, QryGroup2, QryGroup3, QryGroup4 FROM OITM
WHERE (CASE WHEN QryGroup1 = 'Y' THEN 1 ELSE 0 END + CASE WHEN QryGroup2 = 'Y' THEN 1 ELSE 0 END + CASE WHEN QryGroup3 = 'Y' THEN 1 ELSE 0 END + CASE WHEN QryGroup4 = 'Y' THEN 1 ELSE 0 END) > 1;

PRINT '=== D2. Register net sales by product category ===';

        WITH reg AS (
            SELECT 1 AS Sgn, 'A/R Invoice' AS DocType, h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum AS LineTax,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) AS LineSum
            FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
            UNION ALL
            SELECT -1, 'A/R Credit Memo', h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry)
            FROM ORIN h JOIN RIN1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
        ), x AS (
            SELECT r.Sgn, r.DocType, r.DocEntry, r.DocNum, r.DocDate AS PostingDate, r.CardCode AS CustomerCode, r.CardName AS CustomerName,
                   c.GroupCode AS CustGroupCode, g.GroupName AS CustomerGroup, r.SlpCode, s.SlpName AS Salesperson, r.BPLId, r.LocCode, r.WhsCode,
                   r.ItemCode, r.Dscription AS ItemDescription, ProdCat = CASE WHEN i.QryGroup1 = 'Y' THEN 'Trading' WHEN i.QryGroup2 = 'Y' THEN 'Manufacturing' WHEN i.QryGroup3 = 'Y' THEN 'Ring' WHEN i.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END,
                   ISNULL(w.WhsName, r.WhsCode) AS Warehouse, u.Location AS Unit, r.LineNum,
                   r.Sgn * r.Quantity AS Quantity, r.Price AS Rate, r.Sgn * r.LineTotal AS BasicAmount,
                   r.Sgn * r.LineTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSales,
                   r.Sgn * r.LineTax AS TaxAmount,
                   r.Sgn * r.GTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSalesInclTax
            FROM reg r
            LEFT JOIN OCRD c ON c.CardCode = r.CardCode
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = r.SlpCode
            LEFT JOIN OITM i ON i.ItemCode = r.ItemCode
            LEFT JOIN OWHS w ON w.WhsCode = r.WhsCode
            LEFT JOIN OLCT u ON u.Code = r.LocCode
        )
SELECT x.ProdCat AS ProductCategory, CAST(SUM(x.NetSales) AS decimal(18,2)) AS NetSales FROM x GROUP BY x.ProdCat ORDER BY 2 DESC;

PRINT '=== E1. CUSTOMERS report / Total Customers tile (current position, ignores dates) ===';
SELECT COUNT(*) AS ActiveCustomers FROM OCRD WHERE CardType = 'C' AND frozenFor = 'N';
DECLARE @QStart datetime = '20260701';   -- start of the current FY quarter (Apr/Jul/Oct/Jan)
SELECT COUNT(*) AS CreatedSinceQuarterStart FROM OCRD WHERE CardType = 'C' AND CreateDate >= @QStart;

PRINT '=== E2. PENDING INVOICES report / tile = open deliveries (current position) ===';
SELECT COUNT(*) AS OpenDeliveries, CAST(SUM(DocTotal) AS decimal(18,2)) AS DeliveryTotalInclTax FROM ODLN WHERE DocStatus = 'O' AND CANCELED = 'N';

PRINT '=== E3. SALES ANALYSIS reports: header-based (month / salesperson / customer) — all three totals must be identical; excl. tax shown, change to DocTotal for incl. tax ===';
SELECT 'Monthly Sales total' AS Report, CAST(SUM(DocTotal - VatSum) AS decimal(18,2)) AS Value, COUNT(*) AS Invoices FROM OINV WHERE CANCELED = 'N' AND DocDate >= @From AND DocDate < DATEADD(DAY, 1, @To)
UNION ALL
SELECT 'Sales by Salesperson total', CAST(SUM(DocTotal - VatSum) AS decimal(18,2)), COUNT(*) FROM OINV WHERE CANCELED = 'N' AND DocDate >= @From AND DocDate < DATEADD(DAY, 1, @To)
UNION ALL
SELECT 'Sales by Customer total', CAST(SUM(DocTotal - VatSum) AS decimal(18,2)), COUNT(*) FROM OINV WHERE CANCELED = 'N' AND DocDate >= @From AND DocDate < DATEADD(DAY, 1, @To);

PRINT '=== E4. SALES BY ITEM total (invoice-line based, excl. tax = LineTotal) — differs from E3 by document-level discount/freight, by design ===';
SELECT CAST(SUM(l.LineTotal) AS decimal(18,2)) AS ItemLineTotal, COUNT(DISTINCT h.DocEntry) AS Invoices
FROM INV1 l JOIN OINV h ON h.DocEntry = l.DocEntry WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To) AND l.ItemCode IS NOT NULL;
