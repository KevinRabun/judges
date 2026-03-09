using System.Diagnostics;

public class ShellRunner
{
    private const string ApiKey = "AKIAIOSFODNN7EXAMPLE";

    public static string Exec(string cmd)
    {
        var process = Process.Start("cmd.exe", $"/c {cmd}");
        return process?.StandardOutput.ReadToEnd() ?? "";
    }
}
