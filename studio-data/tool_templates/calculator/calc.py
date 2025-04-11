



def run_calc(a, b, op):
    
    res = None
    if op == "+":
        res = a + b
    elif op == "-":
        res = a - b
    elif op == "*":
        res = a * b
    elif op == "/":
        res = float(a / b)
    else:
        raise ValueError("Invalid operator")
    return str(res)
