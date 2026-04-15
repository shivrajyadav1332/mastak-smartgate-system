using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FullStackSample.Migrations
{
    /// <inheritdoc />
    public partial class AddBarrier : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Barrier",
                table: "Vehicles",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Barrier",
                table: "Vehicles");
        }
    }
}
