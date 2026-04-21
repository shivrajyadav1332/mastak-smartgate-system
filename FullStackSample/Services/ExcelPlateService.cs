using System.Data;
using ExcelDataReader;

namespace FullStackSample.Services
{
    // Service that loads allowed plate numbers from Excel/CSV files
    public class ExcelPlateService
    {
        private readonly ILogger<ExcelPlateService> _logger;

        public ExcelPlateService(ILogger<ExcelPlateService> logger)
        {
            _logger = logger;
        }

        // Load plates from a stream (supports .xlsx, .xls, and CSV)
        public async Task<IEnumerable<string>> LoadPlatesAsync(Stream stream, string? fileName = null, CancellationToken ct = default)
        {
            var plates = new List<string>();

            // ExcelDataReader is synchronous; wrap in Task.Run to avoid blocking
            await Task.Run(() =>
            {
                System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);

                using var reader = ExcelReaderFactory.CreateReader(stream);
                var conf = new ExcelDataSetConfiguration
                {
                    ConfigureDataTable = _ => new ExcelDataTableConfiguration { UseHeaderRow = true }
                };
                var ds = reader.AsDataSet(conf);
                if (ds.Tables.Count > 0)
                {
                    var table = ds.Tables[0];
                    foreach (DataRow row in table.Rows)
                    {
                        if (ct.IsCancellationRequested) break;
                        // Attempt to read first column value as plate
                        var value = row.ItemArray.Length > 0 ? row[0]?.ToString() : null;
                        if (!string.IsNullOrWhiteSpace(value))
                        {
                            plates.Add(value.Trim());
                        }
                    }
                }
            }, ct);

            _logger.LogInformation("Loaded {Count} plates from uploaded file {File}", plates.Count, fileName ?? "(stream)");
            return plates.Distinct(StringComparer.OrdinalIgnoreCase);
        }
    }
}
