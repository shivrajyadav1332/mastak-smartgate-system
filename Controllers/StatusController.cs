using Microsoft.AspNetCore.Mvc;

namespace WeighbridgeMockAPIReplica.Controllers
{
    [ApiController]
    public class StatusController : ControllerBase
    {
        [HttpGet("/")]
        public IActionResult Root()
        {
            var html = @"<!doctype html>
<html>
  <head><meta charset='utf-8'><title>Weighbridge Mock API Replica</title></head>
  <body style='font-family:Segoe UI,Segoe,Arial;max-width:900px;margin:40px auto;'>
    <h1>Weighbridge Mock API Replica</h1>
    <p>API base: <code>/api</code></p>
    <ul>
      <li><a href='/swagger'>Swagger UI</a></li>
      <li><a href='/health'>Health (JSON)</a></li>
      <li><a href='/deviceStatusHub'>SignalR Hub</a></li>
    </ul>
    <p>Background services are running.</p>
  </body>
</html>";
            return Content(html, "text/html");
        }

        [HttpGet("/health")]
        public IActionResult Health() => Ok(new { status = "Healthy" });
    }
}
