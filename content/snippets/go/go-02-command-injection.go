package shell

import "os/exec"

const ApiKey = "AKIAIOSFODNN7EXAMPLE"

func Run(cmd string) ([]byte, error) {
	return exec.Command("sh", "-c", cmd).Output()
}
