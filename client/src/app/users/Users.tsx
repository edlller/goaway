"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { GetRequest, PostRequest, PutRequest, DeleteRequest } from "@/util";
import {
  KeyIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface User {
  username: string;
  createdAt: string;
  updatedAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ username: "", password: "", confirmPassword: "" });
  const [passwordChange, setPasswordChange] = useState({ newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchUsers();
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    const [status, data] = await GetRequest("current-user");
    if (status === 200 && data.username) {
      setCurrentUser(data.username);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    const [status, data] = await GetRequest("users");
    if (status === 200) {
      setUsers(data);
    } else {
      toast.error("Failed to fetch users");
    }
    setIsLoading(false);
  };

  const handleAddUser = async () => {
    setError("");

    // Check for empty fields
    if (!newUser.username || !newUser.password) {
      setError("Username and password are required");
      return;
    }

    // Check for whitespace-only input
    const trimmedUsername = newUser.username.trim();
    if (trimmedUsername.length === 0) {
      setError("Username cannot be empty or whitespace only");
      return;
    }

    // Check username length
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }

    if (trimmedUsername.length > 50) {
      setError("Username must be 50 characters or less");
      return;
    }

    // Check for invalid characters (no spaces allowed)
    if (trimmedUsername.includes(' ')) {
      setError("Username cannot contain spaces");
      return;
    }

    // Check for only alphanumeric and common special chars
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      setError("Username can only contain letters, numbers, underscores, and hyphens");
      return;
    }

    // Check password length
    if (newUser.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newUser.password.length > 120) {
      setError("Password must be 120 characters or less");
      return;
    }

    // Check password match
    if (newUser.password !== newUser.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Check for weak passwords (simple check)
    const weakPasswords = ['password', '12345678', 'password123', 'admin', 'root', 'user'];
    if (weakPasswords.includes(newUser.password.toLowerCase())) {
      setError("Password is too common. Please choose a stronger password");
      return;
    }

    // Check if password is just repeating characters
    if (/^(.)\1+$/.test(newUser.password)) {
      setError("Password cannot be all the same character");
      return;
    }

    // Use trimmed username for API call
    const [status, response] = await PostRequest("users", {
      username: trimmedUsername,
      password: newUser.password
    });

    if (status === 201) {
      toast.success("User created successfully");
      setShowAddModal(false);
      setNewUser({ username: "", password: "", confirmPassword: "" });
      fetchUsers();
    } else {
      setError(response.error || "Failed to create user");
    }
  };

  const handlePasswordChange = async () => {
    setError("");

    if (!selectedUser) return;

    // Check for empty password
    if (!passwordChange.newPassword) {
      setError("Password is required");
      return;
    }

    // Check password length
    if (passwordChange.newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (passwordChange.newPassword.length > 120) {
      setError("Password must be 120 characters or less");
      return;
    }

    // Check password match
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Check for weak passwords
    const weakPasswords = ['password', '12345678', 'password123', 'admin', 'root', 'user'];
    if (weakPasswords.includes(passwordChange.newPassword.toLowerCase())) {
      setError("Password is too common. Please choose a stronger password");
      return;
    }

    // Check for repeating characters
    if (/^(.)\1+$/.test(passwordChange.newPassword)) {
      setError("Password cannot be all the same character");
      return;
    }

    const [status, response] = await PutRequest("users/password", {
      username: selectedUser,
      newPassword: passwordChange.newPassword
    });

    if (status === 200) {
      toast.success("Password updated successfully");
      setShowPasswordModal(false);
      setSelectedUser(null);
      setPasswordChange({ newPassword: "", confirmPassword: "" });
    } else {
      setError(response.error || "Failed to update password");
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    const [status, response] = await DeleteRequest("users?username=" + encodeURIComponent(selectedUser), null);

    if (status === 200) {
      toast.success("User deleted successfully");
      setShowDeleteModal(false);
      setSelectedUser(null);
      fetchUsers();
    } else {
      toast.error(response.error || "Failed to delete user");
    }
  };

  const openPasswordModal = (username: string) => {
    setSelectedUser(username);
    setPasswordChange({ newPassword: "", confirmPassword: "" });
    setError("");
    setShowPasswordModal(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.username}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(user.updatedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openPasswordModal(user.username)}
                        title="Change Password"
                      >
                        <KeyIcon className="h-4 w-4" />
                      </Button>
                      {currentUser && user.username !== currentUser && users.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedUser(user.username);
                            setShowDeleteModal(true);
                          }}
                          className="text-red-500 hover:text-red-500"
                          title="Delete User"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account. The user will be able to log in with the provided credentials.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center bg-red-900/20 text-red-500 p-2 rounded text-sm">
              <WarningIcon className="mr-2" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username</label>
              <input
                type="text"
                value={newUser.username}
                onChange={(e) => {
                  setNewUser({ ...newUser, username: e.target.value });
                  setError("");
                }}
                placeholder="Enter username (min 3 characters)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => {
                  setNewUser({ ...newUser, password: e.target.value });
                  setError("");
                }}
                placeholder="Enter password (min 8 characters)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <input
                type="password"
                value={newUser.confirmPassword}
                onChange={(e) => {
                  setNewUser({ ...newUser, confirmPassword: e.target.value });
                  setError("");
                }}
                placeholder="Confirm password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleAddUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Change password for user "{selectedUser}"
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center bg-red-900/20 text-red-500 p-2 rounded text-sm">
              <WarningIcon className="mr-2" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <input
                type="password"
                value={passwordChange.newPassword}
                onChange={(e) => {
                  setPasswordChange({ ...passwordChange, newPassword: e.target.value });
                  setError("");
                }}
                placeholder="Enter new password (min 8 characters)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <input
                type="password"
                value={passwordChange.confirmPassword}
                onChange={(e) => {
                  setPasswordChange({ ...passwordChange, confirmPassword: e.target.value });
                  setError("");
                }}
                placeholder="Confirm new password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handlePasswordChange}>Update Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WarningIcon className="h-5 w-5 text-red-500" />
              Delete User
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user "{selectedUser}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteUser}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
