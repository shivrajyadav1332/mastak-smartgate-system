using Microsoft.AspNetCore.Mvc;
using FullStackSample.Models;
using System.Linq;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private static readonly List<User> _users = new();
        private static int _nextId = 1;

        [HttpGet]
        public IActionResult Get()
        {
            return Ok(_users);
        }

        [HttpPost]
        public IActionResult Post([FromBody] UserDto? userDto)
        {
            if (userDto == null)
                return BadRequest("User body is required.");

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // duplicate name check (case-insensitive)
            if (_users.Any(u => u.Name.Equals(userDto.Name, System.StringComparison.OrdinalIgnoreCase)))
                return BadRequest("A user with the same name already exists.");

            var user = new User { Id = _nextId++, Name = userDto.Name };
            _users.Add(user);
            return Ok(user);
        }

        [HttpPut("{id}")]
        public IActionResult Put(int id, [FromBody] UserDto? userDto)
        {
            if (userDto == null)
                return BadRequest("User body is required.");

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var user = _users.FirstOrDefault(u => u.Id == id);
            if (user == null)
                return NotFound();

            // duplicate name check excluding the current user
            if (_users.Any(u => u.Id != id && u.Name.Equals(userDto.Name, System.StringComparison.OrdinalIgnoreCase)))
                return BadRequest("A user with the same name already exists.");

            user.Name = userDto.Name;
            return Ok(user);
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var user = _users.FirstOrDefault(u => u.Id == id);
            if (user == null)
                return NotFound();

            _users.Remove(user);
            return Ok();
        }
    }
}
