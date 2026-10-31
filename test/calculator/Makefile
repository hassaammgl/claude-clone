CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra
BIN      := build/calculator
SRC      := main.cpp

all: $(BIN)

$(BIN): $(SRC)
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -o $@ $(SRC)

run: $(BIN)
	./$(BIN)

test: $(BIN)
	./tests/run.sh

clean:
	rm -rf build

.PHONY: all run test clean
