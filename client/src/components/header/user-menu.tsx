"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  GearIcon,
  SignOutIcon,
  UserIcon
} from "@phosphor-icons/react";
import { useState } from "react";

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/login";
  };

  return (
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
  );
}
