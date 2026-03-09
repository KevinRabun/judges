using System.IO;

public class FileService
{
    private const string DbPassword = "P@ssw0rd123!";

    public static string ReadFile(string name)
    {
        return File.ReadAllText(Path.Combine("/data", name));
    }
}
