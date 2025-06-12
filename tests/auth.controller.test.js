import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Login from "../pages/Login";

describe("Login Component", () => {
  const mockOnLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        name: "Test User",
        role: "admin",
        token: "fake-token",
      }),
    });
  });

  test("affiche le formulaire", () => {
    render(<Login onLogin={mockOnLogin} />);
    ["Bibliothèque ISET", "Connexion", "Email", "Mot de passe", "Étudiant", "Administrateur"].forEach(label => {
      expect(screen.getByText(label) || screen.getByLabelText(label)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /se connecter/i })).toBeInTheDocument();
  });

  test("soumet le formulaire avec succès", async () => {
    render(<Login onLogin={mockOnLogin} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "password123" } });
    fireEvent.click(screen.getByLabelText("Administrateur"));
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith({
        id: 1, name: "Test User", role: "admin", token: "fake-token",
      });
    });
  });

  test("affiche une erreur si la connexion échoue", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Email, mot de passe ou rôle incorrect" }),
    });

    render(<Login onLogin={mockOnLogin} />);
    ["Email", "Mot de passe"].forEach((label, i) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value: i === 0 ? "wrong@example.com" : "wrongpassword" } });
    });
    fireEvent.click(screen.getByLabelText("Administrateur"));
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByText(/incorrect/i)).toBeInTheDocument();
    expect(mockOnLogin).not.toHaveBeenCalled();
  });
});
