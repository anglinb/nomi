import { useState } from "react"
import { Ellipsis, Trash2 } from "lucide-react"
import { Button } from "../../ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover"

export function ProjectSectionMenu({
  onRemove,
}: {
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5.5 w-5.5 absolute right-6 !rounded opacity-100 md:opacity-0 md:group-hover/section:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-1 w-auto min-w-[170px]">
        <button
          onClick={(event) => {
            event.stopPropagation()
            setOpen(false)
            onRemove()
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-destructive dark:text-red-400 hover:bg-destructive/10 dark:hover:bg-red-500/20"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-xs font-medium">Remove</span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
