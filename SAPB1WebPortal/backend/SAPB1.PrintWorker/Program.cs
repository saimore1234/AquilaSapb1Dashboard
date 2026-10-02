using System;
using System.Data.SqlClient;
using System.Diagnostics;
using System.IO;
using CrystalDecisions.CrystalReports.Engine;
using CrystalDecisions.Shared;

// Renders ONE existing SAP B1 Crystal layout (.rpt) to PDF. Read-only: it never writes to SAP B1.
// Input arrives on stdin (one value per line) so the DB connection string never appears in the
// process command line:
//   1 rptPath   2 outPdfPath   3 dockey (DocEntry)   4 objectId   5 SQL connection string
// Exit code 0 = PDF written. Non-zero = failure; a short reason goes to stderr (never a stack trace).
internal static class Program
{
    private static int Main()
    {
        try
        {
            string rptPath = Console.In.ReadLine();
            string outPath = Console.In.ReadLine();
            int dockey = int.Parse(Console.In.ReadLine());
            int objectId = int.Parse(Console.In.ReadLine());
            var cs = new SqlConnectionStringBuilder(Console.In.ReadLine());
            var sw = Stopwatch.StartNew();

            using (var rd = new ReportDocument())
            {
                rd.Load(rptPath);
                Console.Error.WriteLine("loaded " + sw.ElapsedMilliseconds + "ms");

                // Point every table/command at the AUTHENTICATED company's database.
                foreach (CrystalDecisions.CrystalReports.Engine.Table t in rd.Database.Tables)
                    Logon(t, cs);
                foreach (ReportDocument sub in rd.Subreports)
                    foreach (CrystalDecisions.CrystalReports.Engine.Table t in sub.Database.Tables)
                        Logon(t, cs);
                Console.Error.WriteLine("logon " + sw.ElapsedMilliseconds + "ms");

                foreach (ParameterField p in rd.ParameterFields)
                {
                    if (p.ReportName != "") continue;
                    if (p.Name.StartsWith("Dockey", StringComparison.OrdinalIgnoreCase)) rd.SetParameterValue(p.Name, dockey);
                    else if (p.Name.StartsWith("ObjectID", StringComparison.OrdinalIgnoreCase)) rd.SetParameterValue(p.Name, objectId);
                }

                rd.ExportToDisk(ExportFormatType.PortableDocFormat, outPath);
                Console.Error.WriteLine("exported " + sw.ElapsedMilliseconds + "ms");
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERR " + ex.GetType().Name + ": " + ex.Message);
            return 2;
        }
    }

    private static void Logon(CrystalDecisions.CrystalReports.Engine.Table t, SqlConnectionStringBuilder cs)
    {
        TableLogOnInfo li = t.LogOnInfo;
        li.ConnectionInfo.ServerName = cs.DataSource;
        li.ConnectionInfo.DatabaseName = cs.InitialCatalog;
        if (cs.IntegratedSecurity) li.ConnectionInfo.IntegratedSecurity = true;
        else { li.ConnectionInfo.UserID = cs.UserID; li.ConnectionInfo.Password = cs.Password; }
        t.ApplyLogOnInfo(li);
    }
}
