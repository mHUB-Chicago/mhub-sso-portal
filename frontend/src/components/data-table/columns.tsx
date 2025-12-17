"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MoreHorizontal } from "lucide-react"
import { Link } from "react-router-dom"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type User = {
  id: string
  fullName: string
  email: string
  company: string
  membership: "Premium" | "Standard" | "Enterprise"
  accessLevel: "Admin" | "Editor" | "Viewer"
  modifiedOn: string
  avatar?: string
}

export const userColumns: ColumnDef<User>[] = [
  {
    accessorKey: "fullName",
    header: "Full Name",
    cell: ({ row }) => {
      const user = row.original
      const initials = user.fullName.split(' ').map(n => n[0]).join('').toUpperCase()
      
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.fullName}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "company",
    header: "Company",
  },
  {
    accessorKey: "membership",
    header: "Peoplevine Membership",
    cell: ({ row }) => {
      const membership = row.getValue("membership") as string
      const variant = membership === "Premium" ? "default" : 
                    membership === "Enterprise" ? "secondary" : "outline"
      
      return <Badge variant={variant}>{membership}</Badge>
    },
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "accessLevel",
    header: "Access Level",
    cell: ({ row }) => {
      const level = row.getValue("accessLevel") as string
      const variant = level === "Admin" ? "destructive" : 
                    level === "Editor" ? "default" : "secondary"
      
      return <Badge variant={variant}>{level}</Badge>
    },
  },
  {
    accessorKey: "modifiedOn",
    header: "Modified On",
    cell: ({ row }) => {
      const date = row.getValue("modifiedOn") as string
      return <div className="text-sm text-muted-foreground">{date}</div>
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem className="text-blue-600">
              View
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link to={`/admin/users/${row.original.id}/edit`} className="w-full">
                Edit user
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>Change access level</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">
              Deactivate user
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]