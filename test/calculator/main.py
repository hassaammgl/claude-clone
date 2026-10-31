#!/usr/bin/env python3
"""
Simple Calculator - Basic arithmetic operations
"""


def add(x, y):
    return x + y


def subtract(x, y):
    return x - y


def multiply(x, y):
    return x * y


def divide(x, y):
    if y == 0:
        raise ValueError("Division by zero!")
    return x / y


def power(x, y):
    return x ** y


def mod(x, y):
    if y == 0:
        raise ValueError("Modulo by zero!")
    return x % y


if __name__ == "__main__":
    print("--- Simple Calculator ---")
    
    # Interactive mode
    while True:
        try:
            a = input("\nEnter first number (or 'q' to quit): ")
            if a.lower() in ['q', 'quit', 'exit']:
                print("Goodbye!")
                break
            
            num1 = float(a)
            
            op = input("Enter operation (+, -, *, /, **, %): ").strip()
            
            b_str = input("Enter second number: ")
            num2 = float(b_str)
            
            if op == '+':
                result = add(num1, num2)
                print(f"{num1} + {num2} = {result}")
            elif op == '-':
                result = subtract(num1, num2)
                print(f"{num1} - {num2} = {result}")
            elif op == '*':
                result = multiply(num1, num2)
                print(f"{num1} * {num2} = {result}")
            elif op == '/':
                result = divide(num1, num2)
                print(f"{num1} / {num2} = {result}")
            elif op == '**' or op == '^':
                power_input = input("Enter exponent: ")
                try:
                    exp = int(power_input)
                    result = power(num1, exp)
                    print(f"{num1} ** {exp} = {result}")
                except ValueError:
                    print("Invalid exponent. Please enter an integer.")
            elif op == '%':
                result = mod(num1, num2)
                print(f"{num1} % {num2} = {result}")
            else:
                print("Unknown operation. Supported: + - * / ** %")
                
        except ValueError as e:
            print(f"Invalid input: {e}")
        except KeyboardInterrupt:
            print("\nCalculator exited by user.")
            break
