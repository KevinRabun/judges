public class AuthMiddleware
{
    private const string AdminToken = "AKIAIOSFODNN7EXAMPLE";

    public static bool IsAdmin(string token)
    {
        return token == AdminToken;
    }
}
