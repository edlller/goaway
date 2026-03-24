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
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { GetRequest, PostRequest } from "@/util";
import {
  GearIcon,
  KeyIcon,
  SignOutIcon,
  UserIcon
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "../ui/input";

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: ""
  });
  const [error, setError] = useState("");

  const handleLogout = () => {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/login";
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) {
      setError("New passwords do not match");
      return;
    }

    if (passwords.new.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    const [status, response] = await PostRequest("password", {
      currentPassword: passwords.current,
      newPassword: passwords.new
    });

    if (status === 200) {
      toast.success("Password changed successfully");
      setShowPasswordModal(false);
      setPasswords({ current: "", new: "", confirm: "" });
      handleLogout();
    } else {
      setError(response.error || "Failed to change password");
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild className="cursor-pointer">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 data-[state=open]:bg-accent"
          >
            <UserIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 overflow-hidden rounded-lg p-0" align="end">
          <div className="flex flex-col p-2">
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
              <UserIcon className="h-4 w-4" />
              <span>Admin</span>
            </div>
            <div className="my-1 border-t" />
            <Button
              variant="ghost"
              className="justify-start px-2 py-1.5 text-sm"
              onClick={() => {
                setIsOpen(false);
                setShowPasswordModal(true);
              }}
            >
              <KeyIcon className="mr-2 h-4 w-4" />
              Change Password
            </Button>
            <Button
              variant="ghost"
              className="justify-start px-2 py-1.5 text-sm"
              onClick={() => {
                setIsOpen(false);
                window.location.href = "/users";
              }}
            >
              <GearIcon className="mr-2 h-4 w-4" />
              Manage Users
            </Button>
            <div className="my-1 border-t" />
            <Button
              variant="ghost"
              className="justify-start px-2 py-1.5 text-sm text-red-500 hover:text-red-500"
              onClick={handleLogout}
            >
              <SignOutIcon className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Update your password. You'll be logged out after changing it.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center bg-red-900/20 text-red-500 p-2 rounded text-sm">
              <span className="mr-2">⚠</span>
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Password</label>
              <Input
                type="password"
                value={passwords.current}
                onChange={(e) => {
                  setPasswords({ ...passwords, current: e.target.value });
                  setError("");
                }}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                value={passwords.new}
                onChange={(e) => {
                  setPasswords({ ...passwords, new: e.target.value });
                  setError("");
                }}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input
                type="password"
                value={passwords.confirm}
                onChange={(e) => {
                  setPasswords({ ...passwords, confirm: e.target.value });
                  setError("");
                }}
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handlePasswordChange}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
