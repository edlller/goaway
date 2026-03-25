"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PostRequest, GetRequest } from "@/util";
import { WarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function SetupPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    username: "admin",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Check if users already exist
    checkUsersExist();
  }, []);

  const checkUsersExist = async () => {
    const [status, data] = await GetRequest("users-exists");
    if (status === 200 && data.exists) {
      // Users already exist, redirect to login
      navigate("/login");
      return;
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    // Validation
    const username = formData.username.trim();
    if (!username || !formData.password) {
      setError("Username and password are required");
      setIsSubmitting(false);
      return;
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      setIsSubmitting(false);
      return;
    }

    if (username.length > 50) {
      setError("Username must be 50 characters or less");
      setIsSubmitting(false);
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError("Username can only contain letters, numbers, underscores, and hyphens");
      setIsSubmitting(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsSubmitting(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    const weakPasswords = ['password', '12345678', 'password123', 'admin', 'root', 'user'];
    if (weakPasswords.includes(formData.password.toLowerCase())) {
      setError("Password is too common. Please choose a stronger password");
      setIsSubmitting(false);
      return;
    }

    if (/^(.)\1+$/.test(formData.password)) {
      setError("Password cannot be all the same character");
      setIsSubmitting(false);
      return;
    }

    // Submit setup request
    const [status, response] = await PostRequest("setup", {
      username: username,
      password: formData.password
    });

    if (status === 201) {
      toast.success("Account created successfully!");
      navigate("/login");
    } else {
      setError(response.error || "Failed to create account");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <span className="text-2xl">🚀</span>
          </div>
          <CardTitle className="text-2xl">Welcome to GoAway</CardTitle>
          <CardDescription>
            Create your admin account to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center bg-red-900/20 text-red-500 p-3 rounded text-sm">
                <WarningIcon className="mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => {
                  setFormData({ ...formData, username: e.target.value });
                  setError("");
                }}
                placeholder="Enter username"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 3 characters. Letters, numbers, underscores, and hyphens only.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  setError("");
                }}
                placeholder="Enter password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 8 characters. Avoid common passwords.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData({ ...formData, confirmPassword: e.target.value });
                  setError("");
                }}
                placeholder="Confirm password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isSubmitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
