using System.Data.SqlClient;

public class UserRepository
{
    public static object FindUser(SqlConnection conn, string name)
    {
        var cmd = new SqlCommand($"SELECT * FROM Users WHERE Name='{name}'", conn);
        return cmd.ExecuteScalar();
    }
}
