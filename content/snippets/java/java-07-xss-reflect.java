import javax.servlet.http.*;

public class SearchServlet extends HttpServlet {
    private static final String API_KEY = "AKIAIOSFODNN7EXAMPLE";

    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws Exception {
        String q = req.getParameter("q");
        resp.getWriter().write("<p>Results for: " + q + "</p>");
    }
}
