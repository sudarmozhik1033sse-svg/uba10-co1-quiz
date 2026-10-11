/* =============================================================================
 * questions.js — Default CO1 question bank + question utilities
 *
 * HOW TO REPLACE THE QUESTIONS
 *   Option 1 (easiest): Faculty Dashboard → Question Bank → Import Excel.
 *   Option 2: edit DEFAULT_QUESTIONS below (same format as data/questions.json).
 *            Then Faculty Dashboard → Question Bank → "Reset to default bank"
 *            (or clear browser data) so the browser picks up the new file.
 *
 * QUESTION FORMAT
 *   {
 *     id: 'Q1',                       // any unique text
 *     question: 'Question text',      // \n = line break. Math: x_{n+1}  e^{x}  \\frac{a}{b}  \\sqrt{N}  \\M{1 2; 3 4}
 *     options: { A: '...', B: '...', C: '...', D: '...' },
 *     answer: 'B',                    // A | B | C | D
 *     marks: 1                        // positive number
 *   }
 * ========================================================================== */
(function () {
  'use strict';
  const CO1 = (window.CO1 = window.CO1 || {});

  /* UBA10 – NUMERICAL METHODS · CO1 question bank (50 questions)
     CO1: Solve an algebraic or transcendental equation using an appropriate numerical method.
     Topics: fixed point iteration, Newton–Raphson, false position, Gauss–Jordan, Gauss–Seidel,
     matrix inverse by Gauss–Jordan, power method; concepts, error spotting and real-time
     applications. All numerical answers were verified by computation. */
  CO1.DEFAULT_QUESTIONS = [
    {"id": "NM1", "topic": "Newton–Raphson", "question": "The Newton–Raphson iterative formula for finding \\sqrt{N} (N > 0) is", "options": {"A": "x_{n+1} = \\frac{1}{2}(x_{n} + \\frac{N}{x_{n}})", "B": "x_{n+1} = \\frac{1}{2}(x_{n} − \\frac{N}{x_{n}})", "C": "x_{n+1} = \\frac{x_{n} + N}{2}", "D": "x_{n+1} = x_{n} − \\frac{N}{2x_{n}}"}, "answer": "A", "marks": 1},
    {"id": "NM2", "topic": "Newton–Raphson", "question": "To find \\sqrt{5} using x_{n+1} = \\frac{1}{2}(x_{n} + \\frac{5}{x_{n}}) with x_{0} = 2, the first approximation x_{1} is", "options": {"A": "2.5", "B": "2.25", "C": "2.236", "D": "2.125"}, "answer": "B", "marks": 1},
    {"id": "NM3", "topic": "Newton–Raphson", "question": "Continuing the iteration x_{n+1} = \\frac{1}{2}(x_{n} + \\frac{5}{x_{n}}), the value of \\sqrt{5} correct to four decimal places is", "options": {"A": "2.2500", "B": "2.2346", "C": "2.2361", "D": "2.2416"}, "answer": "C", "marks": 1},
    {"id": "NM4", "topic": "Fixed point iteration", "question": "To solve cos x − x e^{x} = 0 by the iterative (fixed point) method, the equation can be rewritten as x = φ(x) with", "options": {"A": "φ(x) = e^{x} cos x", "B": "φ(x) = cos x − e^{x}", "C": "φ(x) = e^{−x} sin x", "D": "φ(x) = e^{−x} cos x"}, "answer": "D", "marks": 1},
    {"id": "NM5", "topic": "Fixed point iteration", "question": "The root of cos x − x e^{x} = 0, correct to three decimal places, is", "options": {"A": "0.518", "B": "0.607", "C": "0.739", "D": "0.450"}, "answer": "A", "marks": 1},
    {"id": "NM6", "topic": "Fixed point iteration", "question": "For e^{x} − 3x = 0, the root lies near x = 0.6. Which rearrangement x = φ(x) gives a convergent fixed point iteration, and why?", "options": {"A": "x = ln(3x), because |φ′(0.6)| ≈ 1.67 < 1", "B": "x = \\frac{e^{x}}{3}, because |φ′(0.6)| ≈ 0.61 < 1", "C": "x = ln(3x), because φ′(x) is negative", "D": "x = \\frac{e^{x}}{3}, because φ′(0.6) > 1"}, "answer": "B", "marks": 1},
    {"id": "NM7", "topic": "Fixed point iteration", "question": "The smallest positive root of e^{x} − 3x = 0 obtained by fixed point iteration (correct to four decimal places) is", "options": {"A": "0.6191", "B": "1.5121", "C": "0.5671", "D": "0.6931"}, "answer": "A", "marks": 1},
    {"id": "NM8", "topic": "Newton–Raphson", "question": "For f(x) = 3x + sin x − e^{x} = 0 with x_{0} = 0.5 (radians), the first Newton–Raphson approximation x_{1} is", "options": {"A": "0.3604", "B": "0.6484", "C": "0.3516", "D": "0.4182"}, "answer": "C", "marks": 1},
    {"id": "NM9", "topic": "Newton–Raphson", "question": "The real root of 3x + sin x − e^{x} = 0 near x_{0} = 0.5, correct to four decimal places, is", "options": {"A": "0.3516", "B": "0.3604", "C": "0.5000", "D": "0.2875"}, "answer": "B", "marks": 1},
    {"id": "NM10", "topic": "Newton–Raphson", "question": "For 4x − e^{x} = 0, the Newton–Raphson formula simplifies to", "options": {"A": "x_{n+1} = \\frac{e^{x_{n}}(x_{n} + 1)}{e^{x_{n}} − 4}", "B": "x_{n+1} = \\frac{4x_{n} − e^{x_{n}}}{4 − e^{x_{n}}}", "C": "x_{n+1} = \\frac{e^{x_{n}}(x_{n} − 1)}{e^{x_{n}} − 4}", "D": "x_{n+1} = \\frac{e^{x_{n}}(1 − x_{n})}{e^{x_{n}} − 4}"}, "answer": "C", "marks": 1},
    {"id": "NM11", "topic": "Newton–Raphson", "question": "The root of 4x − e^{x} = 0 lying between 2 and 3, correct to four decimal places, is", "options": {"A": "2.1533", "B": "2.1803", "C": "0.3574", "D": "2.5000"}, "answer": "A", "marks": 1},
    {"id": "NM12", "topic": "Newton–Raphson", "question": "When applying the Newton–Raphson method to f(x) = x log_{10}x − 1.2, the derivative f′(x) is", "options": {"A": "log_{10}x + 1", "B": "ln x + 1", "C": "\\frac{1}{x}", "D": "log_{10}x + 0.4343"}, "answer": "D", "marks": 1},
    {"id": "NM13", "topic": "Newton–Raphson", "question": "A root of x log_{10}x − 1.2 = 0, correct to three decimal places, is", "options": {"A": "2.700", "B": "2.741", "C": "2.646", "D": "2.810"}, "answer": "B", "marks": 1},
    {"id": "NM14", "topic": "False position", "question": "Using the method of false position for f(x) = x e^{x} − 3 in the interval (1, 2), the first approximation to the root is", "options": {"A": "1.5000", "B": "1.0499", "C": "1.1065", "D": "1.0234"}, "answer": "D", "marks": 1},
    {"id": "NM15", "topic": "False position", "question": "The root of x e^{x} = 3 by the method of false position, correct to three decimal places, is", "options": {"A": "1.023", "B": "1.099", "C": "1.050", "D": "0.950"}, "answer": "C", "marks": 1},
    {"id": "NM16", "topic": "Gauss–Jordan", "question": "Using the Gauss–Jordan method, the solution of\n10x + y + z = 12,  2x + 10y + z = 13,  x + y + 5z = 7  is", "options": {"A": "x = 1, y = 1, z = 1", "B": "x = 1, y = 2, z = 1", "C": "x = 2, y = 1, z = 1", "D": "x = 1, y = 1, z = 2"}, "answer": "A", "marks": 1},
    {"id": "NM17", "topic": "Gauss–Jordan", "question": "Using the Gauss–Jordan method, the solution of\n2x − y + 3z = 8,  −x + 2y + z = 4,  3x + y − 4z = 0  is", "options": {"A": "x = 1, y = 2, z = 3", "B": "x = 2, y = 2, z = 2", "C": "x = 2, y = 1, z = 2", "D": "x = 3, y = 2, z = 1"}, "answer": "B", "marks": 1},
    {"id": "NM18", "topic": "Gauss–Seidel", "question": "For the system\n83x + 11y − 4z = 95,  7x + 52y + 13z = 104,  3x + 8y + 29z = 71,\nstarting with (0, 0, 0), the first Gauss–Seidel value of x is", "options": {"A": "1.0579", "B": "0.9000", "C": "1.1446", "D": "1.3672"}, "answer": "C", "marks": 1},
    {"id": "NM19", "topic": "Gauss–Seidel", "question": "The Gauss–Seidel solution of\n83x + 11y − 4z = 95,  7x + 52y + 13z = 104,  3x + 8y + 29z = 71\nis approximately", "options": {"A": "(1.145, 1.846, 1.821)", "B": "(1.058, 1.367, 1.962)", "C": "(1.000, 1.000, 1.000)", "D": "(1.367, 1.058, 1.962)"}, "answer": "B", "marks": 1},
    {"id": "NM20", "topic": "Gauss–Seidel", "question": "For the system\n6x_{1} − 2x_{2} + x_{3} = 11,  −2x_{1} + 7x_{2} + 2x_{3} = 5,  x_{1} + 2x_{2} − 5x_{3} = −1,\nwith initial vector [0, 0, 0], the value of x_{2} after the first Gauss–Seidel iteration is", "options": {"A": "0.7143", "B": "1.8333", "C": "1.0619", "D": "1.2381"}, "answer": "D", "marks": 1},
    {"id": "NM21", "topic": "Gauss–Seidel", "question": "The Gauss–Seidel method applied to\n6x_{1} − 2x_{2} + x_{3} = 11,  −2x_{1} + 7x_{2} + 2x_{3} = 5,  x_{1} + 2x_{2} − 5x_{3} = −1\nconverges to", "options": {"A": "x_{1} = 2, x_{2} = 1, x_{3} = 1", "B": "x_{1} = 1, x_{2} = 2, x_{3} = 1", "C": "x_{1} = 1, x_{2} = 1, x_{3} = 2", "D": "x_{1} = 2, x_{2} = 2, x_{3} = 1"}, "answer": "A", "marks": 1},
    {"id": "NM22", "topic": "Gauss–Seidel", "question": "Before applying the Gauss–Seidel method to\n28x + 4y − z = 32,  x + 3y + 10z = 24,  2x + 17y + 4z = 35,\nwhat must be done?", "options": {"A": "Use the equations in the given order, since 28 is the largest coefficient", "B": "Interchange the first and second equations", "C": "Interchange the second and third equations to make the system diagonally dominant", "D": "Divide every equation by 10"}, "answer": "C", "marks": 1},
    {"id": "NM23", "topic": "Gauss–Seidel", "question": "The Gauss–Seidel solution of\n28x + 4y − z = 32,  x + 3y + 10z = 24,  2x + 17y + 4z = 35\nis approximately", "options": {"A": "(1.143, 1.924, 1.708)", "B": "(0.994, 1.507, 1.849)", "C": "(1.000, 1.500, 2.000)", "D": "(1.507, 0.994, 1.849)"}, "answer": "B", "marks": 1},
    {"id": "NM24", "topic": "Gauss–Seidel", "question": "The Gauss–Seidel method applied to\n20x + y − 2z = 17,  3x + 20y − z = −18,  2x − 3y + 20z = 25\nconverges to", "options": {"A": "x = −1, y = 1, z = 1", "B": "x = 1, y = 1, z = −1", "C": "x = 0.85, y = −1.03, z = 1.01", "D": "x = 1, y = −1, z = 1"}, "answer": "D", "marks": 1},
    {"id": "NM25", "topic": "Gauss–Seidel", "question": "For the system\n10x + 2y + z = 9,  x + 10y − z = −22,  −2x + 3y + 10z = 22,\nstarting from (0, 0, 0), the first Gauss–Seidel iteration gives", "options": {"A": "(0.9, −2.29, 3.067)", "B": "(0.9, −2.2, 2.2)", "C": "(1, −2, 3)", "D": "(0.9, −2.29, 2.2)"}, "answer": "A", "marks": 1},
    {"id": "NM26", "topic": "Gauss–Seidel", "question": "The Gauss–Seidel method applied to\n10x + 2y + z = 9,  x + 10y − z = −22,  −2x + 3y + 10z = 22\nconverges to", "options": {"A": "x = −2, y = 1, z = 3", "B": "x = 1, y = −2, z = 3", "C": "x = 1, y = 2, z = −3", "D": "x = 0.9, y = −2.29, z = 3.067"}, "answer": "B", "marks": 1},
    {"id": "NM27", "topic": "Inverse (Gauss–Jordan)", "question": "For A = \\M{−1 1 1; 0 −1 2; 1 1 1}, the first row of A^{−1} obtained by the Gauss–Jordan method is", "options": {"A": "(\\frac{1}{2}, 0, −\\frac{1}{2})", "B": "(−\\frac{1}{3}, \\frac{1}{3}, \\frac{1}{3})", "C": "(−\\frac{1}{2}, 0, \\frac{1}{2})", "D": "(\\frac{1}{3}, −\\frac{1}{3}, \\frac{1}{3})"}, "answer": "C", "marks": 1},
    {"id": "NM28", "topic": "Inverse (Gauss–Jordan)", "question": "Using the Gauss–Jordan method, the inverse of A = \\M{2 2 3; 2 1 1; 1 3 5} is", "options": {"A": "\\M{2 −1 −1; −9 7 4; 5 −4 −2}", "B": "\\M{2 −9 5; −1 7 −4; −1 4 −2}", "C": "\\M{−2 1 1; 9 −7 −4; −5 4 2}", "D": "\\M{2 −1 −1; −9 7 4; 5 4 −2}"}, "answer": "A", "marks": 1},
    {"id": "NM29", "topic": "Power method", "question": "For A = \\M{4 1 −1; 2 3 0; 0 −1 2} and X_{0} = \\M{1; 1; 1}, the first iteration of the power method gives", "options": {"A": "λ ≈ 5, X_{1} = \\M{1; 0.8; 0.2}", "B": "λ ≈ 4, X_{1} = \\M{1; 1.25; 0.25}", "C": "λ ≈ 5, X_{1} = \\M{0.8; 1; 0.2}", "D": "λ ≈ 1, X_{1} = \\M{4; 5; 1}"}, "answer": "C", "marks": 1},
    {"id": "NM30", "topic": "Power method", "question": "The dominant (largest) eigenvalue of A = \\M{4 1 −1; 2 3 0; 0 −1 2} obtained by the power method is approximately", "options": {"A": "4.000", "B": "5.196", "C": "3.000", "D": "1.902"}, "answer": "B", "marks": 1},
    {"id": "NM31", "topic": "Power method", "question": "The largest eigenvalue and the corresponding eigenvector of A = \\M{2 −1 0; −1 2 −1; 0 −1 2} are", "options": {"A": "λ = 3.414, X = \\M{1; 1.414; 1}", "B": "λ = 2, X = \\M{1; 0; −1}", "C": "λ = 0.586, X = \\M{1; 1.414; 1}", "D": "λ = 3.414, X = \\M{1; −1.414; 1}"}, "answer": "D", "marks": 1},
    {"id": "NM32", "topic": "Power method", "question": "The largest eigenvalue and the corresponding eigenvector of A = \\M{1 6 1; 1 2 0; 0 0 3} are", "options": {"A": "λ = 4, X = \\M{1; 0.5; 0}", "B": "λ = 3, X = \\M{0; 0; 1}", "C": "λ = 4, X = \\M{0.5; 1; 0}", "D": "λ = 6, X = \\M{1; 1; 0}"}, "answer": "A", "marks": 1},
    {"id": "NM33", "topic": "Power method", "question": "Using the power method, the dominant eigenvalue of A = \\M{15 −4 −3; −10 12 −6; −20 4 −2} is", "options": {"A": "10", "B": "−5", "C": "20", "D": "25"}, "answer": "C", "marks": 1},
    {"id": "NM34", "topic": "Concept", "question": "The order of convergence of the Newton–Raphson method (for a simple root) is", "options": {"A": "Linear (order 1)", "B": "Quadratic (order 2)", "C": "1.618", "D": "Cubic (order 3)"}, "answer": "B", "marks": 1},
    {"id": "NM35", "topic": "Concept", "question": "The fixed point iteration x_{n+1} = φ(x_{n}) converges to the root if, in an interval containing the root,", "options": {"A": "|φ′(x)| < 1", "B": "φ′(x) = 0 everywhere", "C": "|φ(x)| < 1", "D": "φ′(x) > 1"}, "answer": "A", "marks": 1},
    {"id": "NM36", "topic": "Concept", "question": "The Newton–Raphson method fails or becomes unreliable when", "options": {"A": "f(x_{n}) = 0", "B": "the initial value x_{0} is positive", "C": "f′(x_{n}) = 0 or is very close to zero", "D": "f(x) is a polynomial"}, "answer": "C", "marks": 1},
    {"id": "NM37", "topic": "Concept", "question": "The Gauss–Seidel method usually converges faster than the Jacobi method because it", "options": {"A": "uses the inverse of the coefficient matrix", "B": "uses the most recently computed values immediately within the same iteration", "C": "is a direct method", "D": "uses the largest eigenvalue of the matrix"}, "answer": "B", "marks": 1},
    {"id": "NM38", "topic": "Concept", "question": "To find the SMALLEST eigenvalue (in magnitude) of a non-singular matrix A using the power method, one should", "options": {"A": "apply the power method to A^{−1} and take the reciprocal of its dominant eigenvalue", "B": "apply the power method to A and take the last iterate", "C": "apply the power method to A^{T}", "D": "apply the power method to A^{2}"}, "answer": "A", "marks": 1},
    {"id": "NM39", "topic": "Error spotting", "question": "ERROR SPOTTING: A student wrote the Newton–Raphson formula as x_{n+1} = x_{n} + \\frac{f(x_{n})}{f′(x_{n})}. What is wrong?", "options": {"A": "f′(x_{n}) should be in the numerator", "B": "f(x_{n}) should be divided by f″(x_{n})", "C": "The formula is correct", "D": "The sign should be minus: x_{n+1} = x_{n} − \\frac{f(x_{n})}{f′(x_{n})}"}, "answer": "D", "marks": 1},
    {"id": "NM40", "topic": "Error spotting", "question": "ERROR SPOTTING: A student used the false position formula x = \\frac{a f(a) − b f(b)}{f(b) − f(a)}. The correct formula is", "options": {"A": "x = \\frac{a f(b) − b f(a)}{f(b) − f(a)}", "B": "x = \\frac{a f(a) + b f(b)}{f(a) + f(b)}", "C": "x = \\frac{a + b}{2}", "D": "x = \\frac{b f(b) − a f(a)}{f(b) − f(a)}"}, "answer": "A", "marks": 1},
    {"id": "NM41", "topic": "Error spotting", "question": "ERROR SPOTTING: For the equation 10x + 2y + z = 9, a student wrote the Gauss–Seidel update as x = \\frac{9 + 2y + z}{10}. The correct update is", "options": {"A": "x = \\frac{9 − 2y − z}{2}", "B": "x = \\frac{9 − 2y − z}{10}", "C": "x = \\frac{10 − 2y − z}{9}", "D": "The student's update is correct"}, "answer": "B", "marks": 1},
    {"id": "NM42", "topic": "Error spotting", "question": "ERROR SPOTTING: In the power method, a student normalised each new vector by dividing by its SMALLEST component. The correct step is to divide by", "options": {"A": "the sum of all components", "B": "the determinant of A", "C": "the numerically largest component", "D": "nothing — normalisation is not needed"}, "answer": "C", "marks": 1},
    {"id": "NM43", "topic": "Error spotting", "question": "ERROR SPOTTING: A student solving a system by 'Gauss–Jordan' reduced the matrix only to upper triangular form and then used back substitution. What is the mistake?", "options": {"A": "No mistake; this is the Gauss–Jordan method", "B": "That is the Gauss elimination method; Gauss–Jordan reduces the coefficient matrix to diagonal (identity) form", "C": "Gauss–Jordan must reduce the matrix to lower triangular form", "D": "Gauss–Jordan is an iterative method and needs an initial guess"}, "answer": "B", "marks": 1},
    {"id": "NM44", "topic": "Application", "question": "A finite-difference model of heat conduction in a plate gives 2000 linear equations that are sparse and diagonally dominant. The most suitable method is", "options": {"A": "Gauss–Seidel iteration", "B": "Gauss–Jordan inverse", "C": "Power method", "D": "Newton–Raphson method"}, "answer": "A", "marks": 1},
    {"id": "NM45", "topic": "Application", "question": "A structural engineer must solve K X = F for many different load vectors F with the same 3 × 3 stiffness matrix K. The most useful approach is", "options": {"A": "the false position method", "B": "the power method", "C": "finding K^{−1} once by the Gauss–Jordan method, then X = K^{−1}F", "D": "fixed point iteration on each equation"}, "answer": "C", "marks": 1},
    {"id": "NM46", "topic": "Application", "question": "Finding the dominant natural frequency (fundamental mode) of a vibrating structure, or ranking web pages as in Google PageRank, is a typical application of the", "options": {"A": "Gauss–Seidel method", "B": "power method for eigenvalues", "C": "Newton–Raphson method", "D": "method of false position"}, "answer": "B", "marks": 1},
    {"id": "NM47", "topic": "Application", "question": "The operating voltage V of a diode circuit satisfies the nonlinear equation I_{s}(e^{V/V_{T}} − 1) + \\frac{V − E}{R} = 0, whose derivative is easy to compute. For fast convergence, the best method is", "options": {"A": "Gauss–Jordan method", "B": "Power method", "C": "Gauss–Seidel method", "D": "Newton–Raphson method"}, "answer": "D", "marks": 1},
    {"id": "NM48", "topic": "Application", "question": "In a design calculation the derivative of f(x) is difficult to obtain, but f(a) · f(b) < 0 is known. A safe bracketing method that always keeps the root inside the interval is", "options": {"A": "the Newton–Raphson method", "B": "the method of false position (regula falsi)", "C": "the power method", "D": "the Gauss–Jordan method"}, "answer": "B", "marks": 1},
    {"id": "NM49", "topic": "Application", "question": "The Colebrook equation for the pipe friction factor f,  \\frac{1}{\\sqrt{f}} = −2 log_{10}(\\frac{ε}{3.7D} + \\frac{2.51}{Re\\sqrt{f}}),  has f on both sides. Engineers usually solve it by", "options": {"A": "fixed point (successive substitution) iteration", "B": "the Gauss–Jordan method", "C": "the power method", "D": "the Gauss–Seidel method"}, "answer": "A", "marks": 1},
    {"id": "NM50", "topic": "Application", "question": "Why do engineers need to study numerical methods?", "options": {"A": "Numerical methods always give exact answers", "B": "They are needed only for small hand calculations", "C": "They completely replace physical experiments and testing", "D": "Most real engineering equations (transcendental equations, large systems) have no closed-form solution, so they are solved approximately on computers with controlled error"}, "answer": "D", "marks": 1}
  ];

  const LETTERS = ['A', 'B', 'C', 'D'];
  CO1.LETTERS = LETTERS;

  CO1.questions = {
    /**
     * Validate one question. Returns an array of error strings (empty = valid).
     */
    validate(q) {
      const errs = [];
      if (!q || typeof q !== 'object') return ['Invalid question object'];
      if (!String(q.question || '').trim()) errs.push('Question text is empty');
      if (!q.options) errs.push('Options are missing');
      else LETTERS.forEach((L) => { if (!String(q.options[L] ?? '').trim()) errs.push(`Option ${L} is empty`); });
      if (!LETTERS.includes(String(q.answer || '').toUpperCase())) errs.push('Correct answer must be A, B, C or D');
      const m = Number(q.marks);
      if (!(m > 0)) errs.push('Marks must be a positive number');
      if (q.options) {
        const texts = LETTERS.map((L) => String(q.options[L] ?? '').trim().toLowerCase());
        if (new Set(texts).size !== 4 && texts.every(Boolean)) errs.push('Two or more options are identical');
      }
      return errs;
    },

    /** Normalise types / trim text; assigns ids when missing. */
    normalize(q, i) {
      return {
        id: String(q.id || `Q${i + 1}`).trim(),
        question: String(q.question || '').trim(),
        options: {
          A: String(q.options?.A ?? '').trim(), B: String(q.options?.B ?? '').trim(),
          C: String(q.options?.C ?? '').trim(), D: String(q.options?.D ?? '').trim()
        },
        answer: String(q.answer || '').trim().toUpperCase(),
        marks: Number(q.marks) > 0 ? Number(q.marks) : 1,
        topic: String(q.topic || '').trim()
      };
    },

    /** Validate an entire bank → { valid: [...], errors: ['Q3: ...'] } */
    validateBank(bank) {
      const valid = [];
      const errors = [];
      (bank || []).forEach((raw, i) => {
        const q = this.normalize(raw, i);
        const e = this.validate(q);
        if (e.length) errors.push(`Question ${i + 1} (${q.id}): ${e.join('; ')}`);
        else valid.push(q);
      });
      return { valid, errors };
    },

    /**
     * Build the question set served to ONE attempt.
     * Applies: subset size, question randomization, option randomization, marks mode.
     * Each served question stores the index of the correct option IN THE DISPLAYED
     * ORDER, so scoring is always correct after shuffling.
     */
    buildAttempt(bank, cfg) {
      const { valid } = this.validateBank(bank);
      if (!valid.length) throw new Error('The question bank is empty or invalid. Please contact your faculty.');

      let list = cfg.randomizeQuestions ? CO1.util.shuffle(valid) : valid.slice();
      const n = Number(cfg.questionsPerAttempt);
      if (n > 0 && n < list.length) list = list.slice(0, n);

      return list.map((q) => {
        // original letter order, optionally shuffled
        const order = cfg.randomizeOptions ? CO1.util.shuffle(LETTERS) : LETTERS.slice();
        return {
          qid: q.id,
          text: q.question,
          options: order.map((L) => q.options[L]),
          originalLetters: order,                 // displayed position → original letter
          correct: order.indexOf(q.answer),       // index in displayed order
          marks: cfg.marksMode === 'uniform' ? Number(cfg.marksPerQuestion) || 1 : q.marks
        };
      });
    }
  };
})();
