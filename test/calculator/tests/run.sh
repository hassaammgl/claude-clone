#!/usr/bin/env bash
# Smoke tests for the calculator. Run from test/calculator: make test
set -u

BIN="${1:-build/calculator}"
pass=0
fail=0

check() {
    local expr="$1" want="$2" got
    got=$("$BIN" "$expr" 2>&1)
    if [[ "$got" == "$want" ]]; then
        printf 'ok    %-22s = %s\n' "$expr" "$got"
        pass=$((pass + 1))
    else
        printf 'FAIL  %-22s want %s, got %s\n' "$expr" "$want" "$got"
        fail=$((fail + 1))
    fi
}

check_repl() {
    local input="$1" want="$2" got
    got=$(printf '%s\nquit\n' "$input" | "$BIN" | tail -n 1)
    if [[ "$got" == "$want" ]]; then
        printf 'ok    repl %-17s = %s\n' "$input" "$got"
        pass=$((pass + 1))
    else
        printf 'FAIL  repl %-17s want %s, got %s\n' "$input" "$want" "$got"
        fail=$((fail + 1))
    fi
}

check "2+3*4" "14"
check "(2+3)*4" "20"
check "2^3^2" "512"
check "-2^2" "-4"
check "2^-3" "0.125"
check "5!" "120"
check "10%3" "1"
check "sqrt(16)" "4"
check "cbrt(27)" "3"
check "log(exp(1))" "1"
check "abs(-3)" "3"
check "pi" "3.14159265358979"
check "0.1+0.2" "0.3"
check "1/0" "error: division by zero"
check "sqrt(-1)" "error: sqrt of a negative number"
check "nope(2)" "error: unknown function 'nope'"

check_repl "deg
sin(30)" "0.5"

check_repl "deg
asin(0.5)" "30"

echo
echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
