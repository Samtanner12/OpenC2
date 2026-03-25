using OpenC2.Server.Hubs;
using OpenC2.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddSignalR().AddJsonProtocol();
builder.Services.AddHttpClient<WeatherService>();
builder.Services.AddSingleton<TrackStateStore>();
builder.Services.AddSingleton<AirPictureBroadcastService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<AirPictureBroadcastService>());
builder.Services.AddHostedService<SimulatorTcpServer>();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();
app.MapHub<AirPictureHub>("/hubs/air-picture");

app.MapFallbackToFile("/index.html");

app.Run();
