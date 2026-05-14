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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check, ChevronsUpDown } from "lucide-react"

export interface FilterOption {
  value: string
  label: string
}

export interface FilterConfig {
  columnId: string
  placeholder: string
  options: FilterOption[]
  width?: string
  type?: 'select' | 'combobox'
}

function ComboboxFilter({ filter, value, onChange }: { filter: FilterConfig; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const selected = filter.options.find(o => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={`h-10 justify-between font-normal ${filter.width ?? "w-40"}`}>
          <span className="truncate">{selected ? selected.label : `All ${filter.placeholder}`}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${filter.placeholder.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all" onSelect={() => { onChange("all"); setOpen(false) }}>
                <Check className={`mr-2 h-4 w-4 ${!selected ? "opacity-100" : "opacity-0"}`} />
                All {filter.placeholder}
              </CommandItem>
              {filter.options.map(opt => (
                <CommandItem key={opt.value} value={opt.label} onSelect={() => { onChange(opt.value); setOpen(false) }}>
                  <Check className={`mr-2 h-4 w-4 ${value === opt.value ? "opacity-100" : "opacity-0"}`} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchPlaceholder?: string
  filters?: FilterConfig[]
  pageSize?: number
  serverSide?: boolean
  totalRows?: number
  currentPage?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
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
  onPageSizeChange,
  onSearchChange,
  onFilterChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({})

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
      setFilterValues(prev => ({ ...prev, [columnId]: value }))
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
    setFilterValues({})
    if (serverSide) {
      onSearchChange?.("")
      filters.forEach(f => onFilterChange?.(f.columnId, undefined))
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 py-4">
        <Input
          placeholder={searchPlaceholder}
          value={globalFilter ?? ""}
          onChange={(event) => handleSearchChange(event.target.value)}
          className="h-10 max-w-sm"
        />
        {filters.map((filter) => {
          const value = serverSide
            ? (filterValues[filter.columnId] ?? "all")
            : ((table.getColumn(filter.columnId)?.getFilterValue() as string) ?? "all")
          if (filter.type === 'combobox') {
            return (
              <ComboboxFilter
                key={filter.columnId}
                filter={filter}
                value={value}
                onChange={(v) => handleFilterChange(filter.columnId, v)}
              />
            )
          }
          return (
            <Select
              key={filter.columnId}
              onValueChange={(value) => handleFilterChange(filter.columnId, value)}
              value={value}
            >
              <SelectTrigger className={`h-10 ${filter.width ?? "w-40"}`}>
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
          )
        })}
        {filters.length > 0 && (
          <Button variant="ghost" size="sm" className="h-10" onClick={handleResetFilters}>
            Reset
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const size = header.column.columnDef.size
                  return (
                    <TableHead key={header.id} style={size ? { width: size, minWidth: size } : undefined}>
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
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {serverSide ? (
              <>Showing {totalRows === 0 ? 0 : currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, totalRows)} of {totalRows}</>
            ) : (
              <>Showing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length}</>
            )}
          </div>
          {onPageSizeChange && (
            <Select
              value={String(pageSize)}
              onValueChange={(val) => {
                onPageSizeChange(Number(val))
                onPageChange?.(0)
              }}
            >
              <SelectTrigger className="w-28 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
