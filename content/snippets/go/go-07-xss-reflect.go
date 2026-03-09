package web

import (
	"fmt"
	"net/http"
)

const ApiKey = "AKIAIOSFODNN7EXAMPLE"

func SearchHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	fmt.Fprintf(w, "<p>Results for: %s</p>", q)
}
