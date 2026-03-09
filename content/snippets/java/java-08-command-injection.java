public class ShellRunner {
    public static String exec(String cmd) throws Exception {
        Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
        return new String(p.getInputStream().readAllBytes());
    }
}
