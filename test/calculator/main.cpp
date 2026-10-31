// Advanced calculator: basic arithmetic + scientific functions.
// Build: make        Run: ./build/calculator        One-shot: ./build/calculator "2+3*4"

#include <cctype>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unistd.h>

namespace {

constexpr double kPi = 3.14159265358979323846;

struct CalcError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

std::string lower(std::string s) {
    for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return s;
}

std::string format(double v) {
    if (std::isnan(v)) return "nan";
    if (std::isinf(v)) return v > 0 ? "inf" : "-inf";
    if (v == 0) return "0";

    std::ostringstream out;
    out << std::setprecision(15) << v;
    std::string s = out.str();
    if (s.find('e') == std::string::npos && s.find('.') != std::string::npos) {
        s.erase(s.find_last_not_of('0') + 1);
        if (!s.empty() && s.back() == '.') s.pop_back();
    }
    return s;
}

class Parser {
public:
    Parser(const std::string& src, bool degrees) : s_(src), degrees_(degrees) {}

    double parse() {
        double v = expression();
        skipSpace();
        if (pos_ != s_.size()) throw CalcError("unexpected '" + s_.substr(pos_, 1) + "'");
        return v;
    }

private:
    const std::string& s_;
    std::size_t pos_ = 0;
    bool degrees_ = false;

    void skipSpace() {
        while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) ++pos_;
    }

    bool eat(char c) {
        skipSpace();
        if (pos_ < s_.size() && s_[pos_] == c) {
            ++pos_;
            return true;
        }
        return false;
    }

    // expression := term (('+' | '-') term)*
    double expression() {
        double v = term();
        for (;;) {
            if (eat('+')) v += term();
            else if (eat('-')) v -= term();
            else return v;
        }
    }

    // term := unary (('*' | '/' | '%') unary)*
    double term() {
        double v = unary();
        for (;;) {
            if (eat('*')) {
                v *= unary();
            } else if (eat('/')) {
                double d = unary();
                if (d == 0) throw CalcError("division by zero");
                v /= d;
            } else if (eat('%')) {
                double d = unary();
                if (d == 0) throw CalcError("modulo by zero");
                v = std::fmod(v, d);
            } else {
                return v;
            }
        }
    }

    // unary := ('+' | '-') unary | power
    double unary() {
        if (eat('+')) return unary();
        if (eat('-')) return -unary();
        return power();
    }

    // power := postfix ('^' unary)?   (right associative: 2^3^2 = 2^(3^2))
    double power() {
        double base = postfix();
        if (eat('^')) return std::pow(base, unary());
        return base;
    }

    // postfix := primary ('!')*
    double postfix() {
        double v = primary();
        while (eat('!')) v = factorial(v);
        return v;
    }

    double primary() {
        skipSpace();
        if (pos_ >= s_.size()) throw CalcError("unexpected end of input");

        char c = s_[pos_];
        if (c == '(') {
            ++pos_;
            double v = expression();
            if (!eat(')')) throw CalcError("missing ')'");
            return v;
        }
        if (std::isdigit(static_cast<unsigned char>(c)) || c == '.') return number();
        if (std::isalpha(static_cast<unsigned char>(c)) || c == '_') return identifier();

        throw CalcError(std::string("unexpected '") + c + "'");
    }

    double number() {
        const char* begin = s_.c_str() + pos_;
        char* end = nullptr;
        double v = std::strtod(begin, &end);
        if (end == begin) throw CalcError("bad number");
        pos_ += static_cast<std::size_t>(end - begin);
        return v;
    }

    double identifier() {
        const std::size_t start = pos_;
        while (pos_ < s_.size() && (std::isalnum(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '_')) ++pos_;
        const std::string name = s_.substr(start, pos_ - start);
        const std::string fn = lower(name);

        if (fn == "pi") return kPi;
        if (fn == "e") return std::exp(1.0);
        if (fn == "tau") return 2 * kPi;

        skipSpace();
        if (pos_ >= s_.size() || s_[pos_] != '(') {
            throw CalcError("unknown name '" + name + "' (functions need brackets, e.g. " + name + "(2))");
        }
        ++pos_;
        const double a = expression();
        if (!eat(')')) throw CalcError("missing ')' after " + name);
        return apply(fn, a);
    }

    double apply(const std::string& fn, double a) const {
        const double toRad = degrees_ ? kPi / 180.0 : 1.0;
        const double fromRad = degrees_ ? 180.0 / kPi : 1.0;

        if (fn == "sin") return std::sin(a * toRad);
        if (fn == "cos") return std::cos(a * toRad);
        if (fn == "tan") return std::tan(a * toRad);
        if (fn == "asin") return std::asin(a) * fromRad;
        if (fn == "acos") return std::acos(a) * fromRad;
        if (fn == "atan") return std::atan(a) * fromRad;
        if (fn == "sinh") return std::sinh(a);
        if (fn == "cosh") return std::cosh(a);
        if (fn == "tanh") return std::tanh(a);

        if (fn == "sqrt") {
            if (a < 0) throw CalcError("sqrt of a negative number");
            return std::sqrt(a);
        }
        if (fn == "cbrt") return std::cbrt(a);
        if (fn == "abs") return std::fabs(a);
        if (fn == "floor") return std::floor(a);
        if (fn == "ceil") return std::ceil(a);
        if (fn == "round") return std::round(a);
        if (fn == "trunc") return std::trunc(a);

        if (fn == "exp") return std::exp(a);
        if (fn == "ln" || fn == "log") {
            if (a <= 0) throw CalcError("log of a non-positive number");
            return std::log(a);
        }
        if (fn == "log10") {
            if (a <= 0) throw CalcError("log10 of a non-positive number");
            return std::log10(a);
        }
        if (fn == "log2") {
            if (a <= 0) throw CalcError("log2 of a non-positive number");
            return std::log2(a);
        }

        throw CalcError("unknown function '" + fn + "'");
    }

    static double factorial(double x) {
        if (x < 0) throw CalcError("factorial of a negative number");
        if (x > 170) throw CalcError("factorial too large");
        if (std::floor(x) == x) {
            double r = 1;
            for (int i = 2; i <= static_cast<int>(x); ++i) r *= i;
            return r;
        }
        return std::tgamma(x + 1); // gamma for non-integers
    }
};

std::string trim(const std::string& s) {
    const auto begin = s.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) return "";
    const auto end = s.find_last_not_of(" \t\r\n");
    return s.substr(begin, end - begin + 1);
}

void help() {
    std::cout <<
        "\ncommands: help  deg  rad  quit\n"
        "operators: + - * / % ^  (  )  !\n"
        "constants: pi  e  tau\n"
        "functions: sqrt cbrt abs exp ln log log10 log2\n"
        "           sin cos tan asin acos atan sinh cosh tanh\n"
        "           floor ceil round trunc\n"
        "examples: 2+3*4   2^10   sqrt(2)   sin(30)   log(exp(1))   5!\n\n";
}

} // namespace

int main(int argc, char** argv) {
    bool degrees = false;

    // one-shot mode: calculator "2+3*4"
    if (argc > 1) {
        std::string expr;
        for (int i = 1; i < argc; ++i) {
            if (i > 1) expr += ' ';
            expr += argv[i];
        }
        try {
            std::cout << format(Parser(expr, degrees).parse()) << "\n";
            return 0;
        } catch (const std::exception& e) {
            std::cerr << "error: " << e.what() << "\n";
            return 1;
        }
    }

    std::cout << "Noni's calculator  (type 'help' for commands)\n";
    std::cout << "mode: radians\n";

    // Prompt sirf interactive terminal pe, taake piped input clean rahe
    const bool interactive = isatty(fileno(stdin));

    std::string line;
    for (;;) {
        if (interactive) std::cout << "> " << std::flush;
        if (!std::getline(std::cin, line)) break;
        line = trim(line);
        if (line.empty()) continue;

        const std::string cmd = lower(line);
        if (cmd == "quit" || cmd == "exit") break;
        if (cmd == "help") {
            help();
            continue;
        }
        if (cmd == "deg") {
            degrees = true;
            std::cout << "mode: degrees\n";
            continue;
        }
        if (cmd == "rad") {
            degrees = false;
            std::cout << "mode: radians\n";
            continue;
        }

        try {
            std::cout << format(Parser(line, degrees).parse()) << "\n";
        } catch (const std::exception& e) {
            std::cout << "error: " << e.what() << "\n";
        }
    }
    return 0;
}
