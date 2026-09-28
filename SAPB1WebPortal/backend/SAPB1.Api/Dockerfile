FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY SAPB1.Api.csproj .
RUN dotnet restore "SAPB1.Api.csproj"

COPY . .
RUN dotnet publish "SAPB1.Api.csproj" -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Most cloud hosts (Render, Railway, Azure Web App for Containers, Fly.io) inject
# a PORT env var and route their own HTTPS edge to it over plain HTTP; the app
# must bind to that port. Defaults to 8080 if the host doesn't set one.
ENV ASPNETCORE_ENVIRONMENT=Production
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/bin/sh", "-c", "ASPNETCORE_URLS=http://+:${PORT} dotnet SAPB1.Api.dll"]
