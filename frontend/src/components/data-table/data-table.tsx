"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface FilterOption {
  value: string
  label: string
}

export interface FilterConfig {
  columnId: string
  placeholder: string
  options: FilterOption[]
  width?: string
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchPlaceholder?: string
  filters?: FilterConfig[]
  pageSize?: number
  // Server-side pagination props
  serverSide?: boolean
  totalRows?: number
  currentPage?: number
  onPageChange?: (page: number) => void
  onSearchChange?: (value: string) => void
  onFilterChange?: (columnId: string, value: string | undefined) => void
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search...",
  filters = [],
  pageSize = 10,
  serverSide = false,
  totalRows = 0,
  currentPage = 0,
  onPageChange,
  onSearchChange,
  onFilterChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")

  const pageCount = serverSide ? Math.ceil(totalRows / pageSize) : undefined

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: serverSide ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: serverSide ? undefined : getFilteredRowModel(),
    manualPagination: serverSide,
    manualFiltering: serverSide,
    pageCount,
    initialState: {
      pagination: {
        pageSize,
        pageIndex: currentPage,
      },
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
      ...(serverSide && { pagination: { pageIndex: currentPage, pageSize } }),
    },
  })

  const handleFilterChange = (columnId: string, value: string) => {
    const resolved = value === "all" ? undefined : value
    if (serverSide && onFilterChange) {
      onFilterChange(columnId, resolved)
    } else {
      table.getColumn(columnId)?.setFilterValue(resolved)
    }
  }

  const handleSearchChange = (value: string) => {
    setGlobalFilter(value)
    if (serverSide && onSearchChange) {
      onSearchChange(value)
    }
  }

  const handleResetFilters = () => {
    setColumnFilters([])
    setGlobalFilter("")
    if (serverSide) {
      onSearchChange?.("")
      filters.forEach(f => onFilterChange?.(f.columnId, undefined))
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between py-4">
        <Input
          placeholder={searchPlaceholder}
          value={globalFilter ?? ""}
          onChange={(event) => handleSearchChange(event.target.value)}
          className="max-w-sm"
        />
        {filters.length > 0 && (
          <div className="flex items-center gap-2">
            {filters.map((filter) => (
              <Select
                key={filter.columnId}
                onValueChange={(value) => handleFilterChange(filter.columnId, value)}
                value={(table.getColumn(filter.columnId)?.getFilterValue() as string) ?? "all"}
              >
                <SelectTrigger className={filter.width ?? "w-40"}>
                  <SelectValue placeholder={filter.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {filter.placeholder}</SelectItem>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              Reset
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {serverSide ? (
            <>
              Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalRows)} of {totalRows} row(s).
            </>
          ) : (
            <>
              Showing {table.getRowModel().rows.length} of{" "}
              {table.getFilteredRowModel().rows.length} row(s).
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">
            Page {(serverSide ? currentPage : table.getState().pagination.pageIndex) + 1} of{" "}
            {serverSide ? pageCount : table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (serverSide && onPageChange) {
                onPageChange(currentPage - 1)
              } else {
                table.previousPage()
              }
            }}
            disabled={serverSide ? currentPage === 0 : !table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (serverSide && onPageChange) {
                onPageChange(currentPage + 1)
              } else {
                table.nextPage()
              }
            }}
            disabled={serverSide ? currentPage >= (pageCount ?? 1) - 1 : !table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
