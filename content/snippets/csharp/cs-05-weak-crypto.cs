using System.Security.Cryptography;
using System.Text;

public class Hasher
{
    public static string HashPassword(string pw)
    {
        var hash = MD5.Create().ComputeHash(Encoding.UTF8.GetBytes(pw));
        return BitConverter.ToString(hash).Replace("-", "");
    }
}
