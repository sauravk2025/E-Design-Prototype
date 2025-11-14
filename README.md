# E-Design Tool

## Overview

The **E-Design Tool** is a dynamic web application built with Angular, allowing users to design electronic layouts by dragging and placing components onto rails. Users can draw wires between components, adjust their placement, and finalize the design. Once finalized, the design can be exported as a PDF for sharing or printing.

## Features

- **Drag-and-Drop Components**: Users can drag and place components (e.g., resistors, capacitors) onto rails.
- **Reposition Components**: Components can be moved to different rails or adjusted on the same rail.
- **Draw and Adjust Lines**: Users can draw wire-like lines to connect components and adjust their positioning.
- **Delete Components and Wires**: Components and lines can be deleted before finalizing the design.
- **Finalize Layout**: Lock the layout once you're satisfied with the placement.
- **Export as PDF**: Export the finalized layout to a PDF document for sharing or printing.

## Technology Stack

- **Frontend**: Angular (latest version)
- **UI Framework**: Angular Material
- **Drag-and-Drop Library**: `angular-drag-and-drop-lists` or custom solution
- **PDF Export**: jsPDF or pdfMake

