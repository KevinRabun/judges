public static class Secrets
{
    public const string ApiKey = "AKIAIOSFODNN7EXAMPLE";

    public static string GetAuthHeader() => $"Bearer {ApiKey}";
}
