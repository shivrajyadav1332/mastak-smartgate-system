using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;
using Microsoft.AspNetCore.Http;
using System.IO;
using System.Linq;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/system")]
    public class SystemController : ControllerBase
    {
        private readonly DeviceService _device;
        private readonly ExcelPlateService? _excel;

        public SystemController(DeviceService device, ExcelPlateService? excel = null)
        {
            _device = device;
            _excel = excel;
        }

        [HttpGet("state")]
        public IActionResult Status()
        {
            // Ensure 'stage' is always present for clients; also include an eventName mapping
            string stageVal = string.IsNullOrEmpty(_device.Stage) ? "IDLE" : _device.Stage;
            string? eventName = stageVal switch
            {
                "ENTRY" => "VEHICLE_ENTRY",
                "WEIGHING" => "WEIGHING",
                "WEIGH_COMPLETE" => "WEIGH_COMPLETE",
                _ => "IDLE"
            };

            return Ok(new
            {
                eventName = eventName,
                stage = stageVal,
                entrySignal = _device.EntrySignal,
                exitSignal = _device.ExitSignal,
                entryBarrier = _device.EntryBarrier,
                exitBarrier = _device.ExitBarrier,
                onScale = _device.OnScale,
                currentTruckPlate = _device.CurrentTruckPlate,
                currentWeight = _device.CurrentWeight,
                mode = _device.Mode,
                ledMessage = _device.LedMessage
            });
        }

        // Accept a full system state payload and apply to the device service
        public class SystemStateDto
        {
            public string? entrySignal { get; set; }
            public string? exitSignal { get; set; }
            public string? entryBarrier { get; set; }
            public string? exitBarrier { get; set; }
            public string? currentTruckPlate { get; set; }
            public int? currentWeight { get; set; }
            public string? mode { get; set; }
            public string? ledMessage { get; set; }
        }

        [HttpPost("state")]
        public IActionResult SetState([FromBody] SystemStateDto dto)
        {
            if (dto == null) return BadRequest("payload required");

            _device.SetSystemState(
                dto.entrySignal ?? _device.EntrySignal,
                dto.exitSignal ?? _device.ExitSignal,
                dto.entryBarrier ?? _device.EntryBarrier,
                dto.exitBarrier ?? _device.ExitBarrier,
                dto.currentTruckPlate ?? _device.CurrentTruckPlate,
                dto.currentWeight ?? _device.CurrentWeight,
                dto.mode ?? _device.Mode,
                dto.ledMessage ?? _device.LedMessage
            );

            return Ok(dto);
        }

        [HttpPost("upload-plates")]
        public async Task<IActionResult> UploadPlates(IFormFile? file)
        {
            if (file == null) return BadRequest("file is required");

            IEnumerable<string> plates;

            if (_excel != null)
            {
                using var stream = file.OpenReadStream();
                plates = await _excel.LoadPlatesAsync(stream, file.FileName);
            }
            else
            {
                // Fallback: accept simple CSV or plain-text lists (one plate per line)
                using var stream = file.OpenReadStream();
                using var reader = new StreamReader(stream);
                var all = await reader.ReadToEndAsync();
                plates = all.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(x => x.Trim())
                            .Where(x => !string.IsNullOrWhiteSpace(x))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToList();
            }

            var plateList = plates.Select(p => p.Trim()).Where(p => p.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            _device.ReplaceAllowedPlates(plateList);

            return Ok(new { count = plateList.Count });
        }

        [HttpGet("allowed-plates")]
        public IActionResult AllowedPlates()
        {
            var list = _device.GetAllowedPlates();
            return Ok(list);
        }

        [HttpPost("allowed-plates")]
        public IActionResult SetAllowedPlates([FromBody] List<string>? plates)
        {
            if (plates == null) return BadRequest("plates required");
            var cleaned = plates.Select(p => (p ?? string.Empty).Trim()).Where(p => p.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            _device.ReplaceAllowedPlates(cleaned);
            return Ok(new { count = cleaned.Count });
        }

        public class TimingsDto
        {
            public int? initialReadyMs { get; set; }
            public int? enteringMs { get; set; }
            public int? weighingMs { get; set; }
            public int? afterWeightMs { get; set; }
            public int? exitMs { get; set; }
        }

        [HttpPost("timings")]
        public IActionResult SetTimings([FromBody] TimingsDto dto)
        {
            if (dto == null) return BadRequest("payload required");
            _device.UpdateTimings(dto.initialReadyMs, dto.enteringMs, dto.weighingMs, dto.afterWeightMs, dto.exitMs);
            return Ok(_device.GetTimings());
        }

        // DTOs for running a custom sequence
        public class SequenceStepDto
        {
            public string? step { get; set; }
            public string? entrySignal { get; set; }
            public string? exitSignal { get; set; }
            public string? entryBarrier { get; set; }
            public string? exitBarrier { get; set; }
            public string? currentTruckPlate { get; set; }
            public int? currentWeight { get; set; }
            public string? ledMessage { get; set; }
            public int? delayMs { get; set; }
        }

        public class SequenceDto
        {
            public string? stage { get; set; }
            public List<SequenceStepDto>? steps { get; set; }
        }

        // Run a provided sequence of state steps (fire-and-forget). Each step is applied and broadcast.
        [HttpPost("run-sequence")]
        public IActionResult RunSequence([FromBody] SequenceDto? seq)
        {
            if (seq == null || seq.steps == null || seq.steps.Count == 0) return BadRequest("sequence required");

            // Run asynchronously so caller gets immediate response
            _ = Task.Run(async () =>
            {
                foreach (var s in seq.steps)
                {
                    try
                    {
                        _device.SetSystemState(
                            s.entrySignal ?? _device.EntrySignal,
                            s.exitSignal ?? _device.ExitSignal,
                            s.entryBarrier ?? _device.EntryBarrier,
                            s.exitBarrier ?? _device.ExitBarrier,
                            s.currentTruckPlate ?? _device.CurrentTruckPlate,
                            s.currentWeight ?? _device.CurrentWeight,
                            _device.Mode,
                            s.ledMessage ?? _device.LedMessage
                        );

                        // default delay between steps if not specified
                        var delay = s.delayMs ?? 800;
                        await Task.Delay(Math.Max(0, delay));
                    }
                    catch
                    {
                        // swallow per-step errors for demo
                    }
                }
            });

            return Accepted(new { started = true, stage = seq.stage });
        }
    }
}
