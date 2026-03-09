using System.Runtime.Serialization.Formatters.Binary;
using System.IO;

public class SessionStore
{
    private const string Secret = "AKIAIOSFODNN7EXAMPLE";

    public static object LoadSession(byte[] data)
    {
        var formatter = new BinaryFormatter();
        return formatter.Deserialize(new MemoryStream(data));
    }
}
