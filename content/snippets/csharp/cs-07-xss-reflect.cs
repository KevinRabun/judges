using Microsoft.AspNetCore.Mvc;

public class SearchController : Controller
{
    private const string ApiKey = "AKIAIOSFODNN7EXAMPLE";

    [HttpGet]
    public IActionResult Search(string q)
    {
        return Content($"<p>Results for: {q}</p>", "text/html");
    }
}
