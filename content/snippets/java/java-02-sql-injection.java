import java.sql.*;

public class UserDao {
    private static final String DB_PASSWORD = "P@ssw0rd123!";

    public ResultSet findUser(Connection conn, String name) throws SQLException {
        return conn.createStatement()
            .executeQuery("SELECT * FROM users WHERE name='" + name + "'");
    }
}
